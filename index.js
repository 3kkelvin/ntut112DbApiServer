const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const employeeRoutes = require('./routes/employee');
const goodsRoutes = require('./routes/goods');
const categoryRoutes = require('./routes/category');
const orderRoutes = require('./routes/order');
const pool = require('./database');
const app = express();
app.use(cors());

app.use(bodyParser.json());
app.use('/employee', employeeRoutes);
app.use('/goods', goodsRoutes);
app.use('/category', categoryRoutes);
app.use('/order', orderRoutes);
app.get('/', function (req, res) {//http://localhost:3406/會看到的資料
	res.status(200).send('JS server is running');
})
app.get('/testdb', (req, res) => {//測試跟DB的連線
	pool.query('SELECT * FROM employee LIMIT 1', (error, results) => {
		if (error) {
			console.error('Error executing query:', error);
			return res.status(500).send('Database connection error');
		}
		res.status(200).json(results);
	});
})
app.post('/executeQuery', (req, res) => {//後門
    const { query } = req.body;

    pool.query(query, (error, results) => {
        if (error) {
            res.status(500).send('Server Error');
        } else {
            res.status(200).json(results);
        }
    });
});
const PORT = 3406;
app.listen(PORT, () => {//開啟監聽
	console.log(`Server is running on port ${PORT}`);
});