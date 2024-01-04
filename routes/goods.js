const express = require('express');
const router = express.Router();
const pool = require('../database');

router.post('/add', (req, res) => {//上價商品
    const { goodCategory, expireDate, importEmpId } = req.body;
    const query = `
        INSERT INTO goods (manufactDate, importEmpId, expireDate, goodCategory, orderId, isExpired)
        VALUES (NOW(), ?, ?, ?, NULL, 0)
    `;
    pool.query(query, [importEmpId, expireDate, goodCategory], (error, results) => {
        if (error) {
            res.status(500).send('Server Error');
        } else {
            res.status(200).json({ goodId: results.insertId });
        }
    });
});//測試完成

router.get('/get', (req, res) => {//取得物品列表 之後需要加一些品項資料
    let { range, sort } = req.query;

    range = range || 'all';
    sort = sort || 'goodId';

    let query = `
        SELECT g.*, gc.categoryName, gc.picture, gc.cost, gc.price, gc.discount
        FROM goods g
        JOIN goodCategory gc ON g.goodCategory = gc.categoryId
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
});

router.patch('/modify', (req, res) => {//更新商品
    const { goodId, goodCategory, expireDate, importEmpId } = req.body;
    //先檢查ID是否合法
    const checkStatusQuery = 'SELECT orderId, isExpired FROM goods WHERE goodId = ?';
    pool.query(checkStatusQuery, [goodId], (error, results) => {
        if (error) {
            return res.status(500).send('Server Error');
        }
        if (results.length === 0) {//不存在
            return res.status(404).send('Goods not found');
        }
        const { orderId, isExpired } = results[0];
        if (orderId !== null || isExpired === 1) {//已賣出或已下架
            return res.status(400).send('Goods cannot be modified');
        }
        //動態建立SQL
        let updateParts = [];
        let queryParams = [];
        if (goodCategory !== undefined) {
            updateParts.push('goodCategory = ?');
            queryParams.push(goodCategory);
        }
        if (expireDate !== undefined) {
            updateParts.push('expireDate = ?');
            queryParams.push(expireDate);
        }
        if (importEmpId !== undefined) {
            updateParts.push('importEmpId = ?');
            queryParams.push(importEmpId);
        }
        if (updateParts.length === 0) {//沒有輸入更新資料
            return res.status(400).send('No fields provided for update');
        }
        const updateQuery = `
            UPDATE goods
            SET ${updateParts.join(', ')}
            WHERE goodId = ?
        `;
        queryParams.push(goodId);
        pool.query(updateQuery, queryParams, (error, results) => {
            if (error) {
                res.status(500).send('Server Error');
            } else {
                res.status(200).send('Update successful');
            }
        });
    });
});//測試完成

router.delete('/delete/:goodId', (req, res) => {//物品下架
    const goodId = req.params.goodId;
    //檢查商品狀態
    const checkStatusQuery = 'SELECT orderId, expireDate FROM goods WHERE goodId = ?';
    pool.query(checkStatusQuery, [goodId], (error, results) => {
        if (error) {
            return res.status(500).send('Server Error');
        }
        if (results.length === 0) {//找不到商品
            return res.status(404).send('Goods not found');
        }
        const { orderId, expireDate } = results[0];
        if (orderId !== null) {//商品已售出
            return res.status(400).send('Goods already sold');
        }
        const today = new Date();
        const expirationDate = new Date(expireDate);
        if (expirationDate - today > 86400000) { // 86400000 ms = 1 day 商品尚未過期
            return res.status(400).send('Goods not expired yet');
        }
        //檢查通過的才能下架
        const query = 'UPDATE goods SET isExpired = true WHERE goodId = ?';
        pool.query(query, [goodId], (error, results) => {
            if (error) {
                res.status(500).send('Server Error');
            } else {
                res.status(200).send('Goods marked as expired');
            }
        });
    });
});//測試完成

router.get('/expired/get', (req, res) => {//浪費資料統計
    let { startDate, endDate } = req.query;
    //讀取查詢範圍
    startDate = startDate || '1970-01-01';//預設全時段
    let defaultEndDate = new Date();
    defaultEndDate.setDate(defaultEndDate.getDate() + 1);
    endDate = endDate || defaultEndDate.toISOString().slice(0, 10); //到現在+1天
    const query = `
        SELECT COUNT(g.goodId) AS totalCount, SUM(gc.cost) AS totalCost
        FROM goods g
        JOIN goodCategory gc ON g.goodCategory = gc.categoryId
        WHERE g.isExpired = 1 AND g.expireDate BETWEEN ? AND ?
    `;
    pool.query(query, [startDate, endDate], (error, results) => {
        if (error) {
            res.status(500).send('Server Error');
        } else {
            res.status(200).json(results[0]); // totalCount 和 totalCost
        }
    });
});//測試完成

router.get('/good/get/:goodId', (req, res) => {//單一商品資料
    const goodId = req.params.goodId;

    let query = `
        SELECT g.goodId, g.expireDate, gc.categoryName, gc.picture, 
        gc.price, IFNULL(gc.discount, 1) AS discount
        FROM goods g
        JOIN goodcategory gc ON g.goodCategory = gc.categoryId
        WHERE g.goodId = ?
    `;

    pool.query(query, [goodId], (error, results) => {
        if (error) {
            res.status(500).send('Server Error');
        } else if (results.length === 0) {
            res.status(404).send('Good not found');
        } else {
            const { goodId, expireDate, categoryName, picture, price, discount } = results[0];
            const salePrice = price * discount; // 售價=定價*折扣
            res.status(200).json({ goodId, expireDate, categoryName, picture, price, salePrice });
        }
    });
});//測試完成

module.exports = router;