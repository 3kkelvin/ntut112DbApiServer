const express = require('express');
const router = express.Router();
const pool = require('../database');
const bcrypt = require('bcrypt');
const saltRounds = 10;

router.post('/add', (req, res) => {//新增員工
    const { empId, password, name, isManager, workingHours, photo, } = req.body;
    bcrypt.hash(password, saltRounds, function (err, hashedPassword) {
        if (err) {
            return res.status(500).send('Error hashing password');
        }
        const query = `
            INSERT INTO employee (empId, password, name, isManager, workingHours, photo, onBoardDate) 
            VALUES (?, ?, ?, ?, ?, ?, NOW())
        `;
        pool.query(query, [empId, hashedPassword, name, isManager, workingHours, photo], (error, results) => {
            if (error) {
                res.status(500).send('Server Error');
            } else {
                res.status(200).json({ empId: results.insertId });
            }
        });
    });
});//測試完成

router.get('/get', (req, res) => {//取得員工資料
    let { range, sort } = req.query;
    // 如果沒有提供範圍或排序條件，用預設值
    range = range || 'all';
    sort = sort || 'isManager DESC, onBoardDate DESC';
    let query = `
    SELECT empId, name, isManager, workingHours, photo, onBoardDate 
    FROM employee 
    WHERE empId != 'guest'`;
    // 根據範圍添加 WHERE 子句（這裡假設 range 是某種可用於過濾的值）
    if (range !== 'all') {
        query += ` WHERE ...`; // 根據具體情況添加適當的 WHERE 條件
    }
    // 添加排序條件
    query += ` ORDER BY ${sort}`;
    pool.query(query, (error, results) => {
        if (error) {
            res.status(500).send('Server Error');
        } else {
            res.status(200).json(results);
        }
    });
});//目前沒有實作排序條件 測試完成

router.patch('/modify', (req, res) => {//更新員工資料
    const { empId, password, name, isManager, newWorkingHours, photo } = req.body;
    //先檢查ID是否合法
    const checkQuery = 'SELECT empId, workingHours FROM employee WHERE empId = ?';
    pool.query(checkQuery, [empId], (error, results) => {
        if (error) {
            return res.status(500).send('Server Error');
        }
        if (results.length === 0) {//不存在
            return res.status(404).send('Employee not found');
        }
        const { empId, workingHours } = results[0];
        if (workingHours === "retired") {//員工已離職
            return res.status(400).send('Employee already retired');
        }
        //動態建立SQL
        let updateParts = [];
        let queryParams = [];
        if (name !== undefined) {
            updateParts.push('name = ?');
            queryParams.push(name);
        }
        if (isManager !== undefined) {
            updateParts.push('isManager = ?');
            queryParams.push(isManager);
        }
        if (newWorkingHours !== undefined) {
            updateParts.push('workingHours = ?');
            queryParams.push(newWorkingHours);
        }
        if (photo !== undefined) {
            updateParts.push('photo = ?');
            queryParams.push(photo);
        }
        if (updateParts.length === 0) {//沒有輸入更新資料
            return res.status(400).send('No fields provided for update');
        }
        if (password !== undefined) {//如果更新密碼
            bcrypt.hash(password, saltRounds, function (err, hashedPassword) {//雜湊
                if (err) {
                    return res.status(500).send('Error hashing password');
                }
                updateParts.push('password = ?');
                queryParams.push(hashedPassword);
                const updateQuery = `UPDATE employee SET ${updateParts.join(', ')} WHERE empId = ?`;
                queryParams.push(empId);
                pool.query(updateQuery, queryParams, (error, results) => {
                    if (error) {
                        res.status(500).send('Server Error');
                    } else {
                        res.status(200).send('Update with password successful');
                    }
                });
            });
        } else {// 如果不更新密碼 直接上傳
            const updateQuery = `UPDATE employee SET ${updateParts.join(', ')}WHERE empId = ?`;
            queryParams.push(empId);
            pool.query(updateQuery, queryParams, (error, results) => {
                if (error) {
                    res.status(500).send('Server Error');
                } else {
                    res.status(200).send('Update successful');
                }
            });
        }
    });
});//測試完成

router.delete('/retire/:empId', (req, res) => {//員工離職
    const empId = req.params.empId;
    const checkQuery = 'SELECT empId, workingHours FROM employee WHERE empId = ?';
    pool.query(checkQuery, [empId], (error, results) => {
        if (error) {
            return res.status(500).send('Server Error');
        }
        if (results.length === 0) {//找不到員工
            return res.status(404).send('Employee not found');
        }
        const { empId, workingHours } = results[0];
        if (workingHours === "retired") {//員工已離職
            return res.status(400).send('Employee already retired');
        }
        //檢查通過的才能下架
        const query = 'UPDATE employee SET workingHours = "retired" WHERE empId = ?';
        pool.query(query, [empId], (error, results) => {
            if (error) {
                res.status(500).send('Server Error');
            } else {
                res.status(200).send('Retirement processed');
            }
        });
    });
});//測試完成

router.post('/login', (req, res) => {//員工登入
    const { empId, password } = req.body;
    //先檢查ID是否合法
    const checkQuery = 'SELECT empId, workingHours FROM employee WHERE empId = ?';
    pool.query(checkQuery, [empId], (error, results) => {
        if (error) {
            return res.status(500).send('Server Error');
        }
        if (results.length === 0) {//不存在
            return res.status(404).send('Employee not found');
        }
        const { empId, workingHours } = results[0];
        if (workingHours === "retired") {//員工已離職
            return res.status(400).send('Employee already retired');
        }
        const Query = `
        SELECT empId, password, name, isManager, workingHours, photo, onBoardDate 
        FROM employee WHERE empId = ?`;
        pool.query(Query, [empId], (error, results) => {
            if (error) {
                res.status(500).send('Server Error');
            } else {
                bcrypt.compare(password, results[0].password, function (err, result) {//驗證密碼
                    if (err) {
                        res.status(500).send('Error verifying password');
                    } else if (!result) {//密碼錯誤
                        res.status(401).send('Incorrect password');
                    } else {
                        delete results[0].password;// 不要回傳密碼
                        res.status(200).json(results[0]);
                    }
                });
            }
        });
    });
});//測試完成

router.get('/order/get', (req, res) => {//員工銷量
    let { startDate, endDate } = req.query;

    startDate = startDate || '1970-01-01';//預設全時段
    let defaultEndDate = new Date();
    defaultEndDate.setDate(defaultEndDate.getDate() + 2);
    endDate = endDate || defaultEndDate.toISOString().slice(0, 10); //到現在+2天

    let query = `
        SELECT e.empId, e.name, e.photo, COUNT(o.orderId) AS orderCount, SUM(o.totalPrice) AS totalSales
        FROM employee e
        LEFT JOIN \`order\` o ON e.empId = o.salesEmpId AND o.saleDate BETWEEN ? AND ?
        WHERE e.empId != 'guest'
        GROUP BY e.empId
    `;

    pool.query(query, [startDate, endDate], (error, results) => {
        if (error) {
            res.status(500).send('Server Error');
        } else {
            res.status(200).json(results);
        }
    });
});//測試完成
module.exports = router;