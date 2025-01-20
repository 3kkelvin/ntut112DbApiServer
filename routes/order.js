const express = require('express');
const router = express.Router();
const pool = require('../database');

router.post('/add', async (req, res) => {//新增訂單
    const { salesEmpId, goodsIds } = req.body;
    pool.getConnection((err, connection) => {//連接DB 比較複雜的API要用這種寫法 要嘛全部成功要嘛全部失敗
        if (err) return connection.rollback(() => {
            res.status(500).send('Server Error');
        }); //DB連接失敗
        connection.beginTransaction(err => {//開始通訊
            if (err) return connection.rollback(() => {
                res.status(500).send('Server Error');
            });
            //檢查是否有已經被賣出或被下架的物品
            const checkGoodsQuery = 'SELECT goodId, orderId, isExpired FROM goods WHERE goodId IN (?)';
            connection.query(checkGoodsQuery, [goodsIds], (error, results) => {
                if (error) {
                    return connection.rollback(() => {
                        res.status(500).send('Server Error');
                    });
                }
                if (results.length === 0) {//如果沒有查到商品
                    connection.rollback(() => {
                        connection.release();
                        res.status(404).send('No goods found');
                    });
                    return;
                }
                const invalidGoods = results.filter(row => row.orderId !== null || row.isExpired === 1);
                if (invalidGoods.length > 0) {
                    connection.rollback(() => {
                        connection.release();
                        res.status(400).json({ error: "Some goods are already sold or expired", invalidGoods: invalidGoods });
                    });
                    return;
                }
                //goods簡稱g goodCategory簡稱gc 尋找goodId在goodsIds中的 用他們的g.goodCategory找gc.cost跟gc.price
                const queryGoods = `
                    SELECT gc.cost, gc.price, IFNULL(gc.discount, 1) AS discount
                    FROM goods g
                    JOIN goodCategory gc ON g.goodCategory = gc.categoryId
                    WHERE g.goodId IN (?)
                `;
                connection.query(queryGoods, [goodsIds], (error, results) => {
                    if (error) {
                        return connection.rollback(() => {
                            res.status(500).send('Server Error');
                        });
                    }
                    //全部加起來得到totalCost跟totalPrice
                    let totalCost = 0;
                    let totalPrice = 0;
                    results.forEach(row => {
                        totalCost += row.cost;
                        totalPrice += row.price * row.discount;//計算打折
                    });
                    //建立新order
                    const insertOrder = `
                        INSERT INTO \`order\` (totalPrice, totalCost, saleDate, salesEmpId)
                        VALUES (?, ?, NOW(), ?)
                    `;
                    connection.query(insertOrder, [totalPrice, totalCost, salesEmpId], (error, results) => {
                        if (error) {
                            return connection.rollback(() => {
                                throw error;
                            });
                        }
                        const newOrderId = results.insertId;
                        //goods當中寫入orderId
                        const updateGoods = `
              UPDATE goods SET orderId = ? WHERE goodId IN (?)
            `;
                        connection.query(updateGoods, [newOrderId, goodsIds], (error, results) => {
                            if (error) {
                                return connection.rollback(() => {
                                    throw error;
                                });
                            }
                            //真的執行上述事件
                            connection.commit(err => {
                                if (err) {
                                    return connection.rollback(() => {
                                        throw err;
                                    });
                                }
                                connection.release();//解除連接 以免pool爆了
                                //返回新orderId
                                res.status(200).json({ orderId: newOrderId, totalPrice: totalPrice });
                            });
                        });
                    });
                });
            })
        });
    });
});//測試完成

router.get('/get', (req, res) => {//查詢訂單細項
    let { startDate, endDate, salesEmpId, sortBy } = req.query;//時間、店員ID、排序條件 
    startDate = startDate || '1970-01-01';//預設全時段
    let defaultEndDate = new Date();
    defaultEndDate.setDate(defaultEndDate.getDate() + 2);
    endDate = endDate || defaultEndDate.toISOString().slice(0, 10); //到現在+2天
    sortBy = sortBy === '1' ? 'totalPrice' : 'saleDate'; // '0' 預設時間排序，'1' 按 totalPrice 排序
    let query = `
        SELECT * FROM \`order\`
        WHERE saleDate BETWEEN ? AND ?
    `;
    const values = [startDate, endDate];
    if (salesEmpId) {//有ID加ID
        query += ' AND salesEmpId = ?';
        values.push(salesEmpId);
    }
    query += ` ORDER BY ${sortBy} DESC`;//SQL加排序條件
    pool.query(query, values, (error, results) => {
        if (error) {
            res.status(500).send('Server Error');
        } else {
            res.status(200).json(results);
        }
    });
});//測試完成

router.get('/category/get/:orderId', (req, res) => {
    const orderId = req.params.orderId;

    let query = `
        SELECT gc.categoryName, COUNT(g.goodId) AS count
        FROM goods g
        JOIN goodCategory gc ON g.goodCategory = gc.categoryId
        WHERE g.orderId = ?
        GROUP BY gc.categoryName
    `;

    pool.query(query, [orderId], (error, results) => {
        if (error) {
            res.status(500).send('Server Error');
        } else {
            res.status(200).json(results);
        }
    });
});//測試完成

router.get('/total/get', (req, res) => {//統計資料查詢
    let { startDate, endDate } = req.query;
    //預設全時段
    startDate = startDate || '1970-01-01';
    let defaultEndDate = new Date();
    defaultEndDate.setDate(defaultEndDate.getDate() + 2);
    endDate = endDate || defaultEndDate.toISOString().slice(0, 10); //到現在+2天
    const query = `
        SELECT
            COUNT(orderId) AS totalOrders,
            SUM(totalPrice) AS totalPrice,
            SUM(totalCost) AS totalCost,
            (SUM(totalPrice) - SUM(totalCost)) AS totalProfit
        FROM \`order\`
        WHERE saleDate BETWEEN ? AND ?
    `;

    pool.query(query, [startDate, endDate], (error, results) => {
        if (error) {
            res.status(500).send('Server Error');
        } else {
            res.status(200).json(results[0]); //回傳統計數據
        }
    });
});//測試完成

router.delete('/delete/:orderId', (req, res) => {//訂單刪除 
    const orderId = req.params.orderId;

    const deleteOrderQuery = 'DELETE FROM `order` WHERE orderId = ?';//因為在DB有設定ON DELETE SET NULL 所以不用手動更新order

    pool.query(deleteOrderQuery, [orderId], (error, results) => {
        if (error) {
            res.status(500).send('Server Error');
        } else {
            res.status(200).send('Order deleted successfully');
        }
    });
});//測試完成
module.exports = router;