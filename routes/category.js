const express = require('express');
const router = express.Router();
const pool = require('../database');

router.post('/add', (req, res) => {//新增品項
    const { categoryName, picture, cost, price, type } = req.body;

    const query = 'INSERT INTO goodCategory (categoryName, picture, cost, price, discount, type) VALUES (?, ?, ?, ?, NULL, ?)';

    pool.query(query, [categoryName, picture, cost, price, type], (error, results) => {
        if (error) {
            res.status(500).send('Server Error');
        } else {
            res.status(200).json({ categoryId: results.insertId });
        }
    });
});//測試完成

router.get('/get', (req, res) => {
    let { range, sort } = req.query;

    range = range || 'all';
    sort = sort || 'categoryId';

    //包含加一個欄位:統計銷量
    let query = `
        SELECT gc.*, COUNT(g.goodId) AS salesCount
        FROM goodCategory gc
        LEFT JOIN goods g ON gc.categoryId = g.goodCategory AND g.orderId IS NOT NULL
        GROUP BY gc.categoryId
    `;

    // 添加範圍和排序條件
    // ...

    pool.query(query, (error, results) => {
        if (error) {
            res.status(500).send('Server Error');
        } else {
            res.status(200).json(results);
        }
    });
});//測試完成

router.patch('/modify', (req, res) => {//更新商品
    const { categoryId, categoryName, picture, cost, price, discount, type } = req.body;
    //先檢查ID是否合法
    const checkQuery = 'SELECT categoryId FROM goodcategory WHERE categoryId = ?';
    pool.query(checkQuery, [categoryId], (error, results) => {
        if (error) {
            return res.status(500).send('Server Error');
        }
        if (results.length === 0) {//不存在
            return res.status(404).send('Category not found');
        }
        //動態建立SQL
        let updateParts = [];
        let queryParams = [];
        if (categoryName !== undefined) {
            updateParts.push('categoryName = ?');
            queryParams.push(categoryName);
        }
        if (picture !== undefined) {
            updateParts.push('picture = ?');
            queryParams.push(picture);
        }
        if (cost !== undefined) {
            updateParts.push('cost = ?');
            queryParams.push(cost);
        }
        if (price !== undefined) {
            updateParts.push('price = ?');
            queryParams.push(price);
        }
        if (discount !== undefined) {
            updateParts.push('discount = ?');
            queryParams.push(discount);
        }
        if (type !== undefined) {
            updateParts.push('type = ?');
            queryParams.push(type);
        }
        if (updateParts.length === 0) {//沒有輸入更新資料
            return res.status(400).send('No fields provided for update');
        }
        const updateQuery = `
            UPDATE goodcategory
            SET ${updateParts.join(', ')}
            WHERE categoryId = ?
        `;
        queryParams.push(categoryId);
        pool.query(updateQuery, queryParams, (error, results) => {
            if (error) {
                res.status(500).send('Server Error');
            } else {
                res.status(200).send('Update successful');
            }
        });
    });
});//測試完成

module.exports = router;