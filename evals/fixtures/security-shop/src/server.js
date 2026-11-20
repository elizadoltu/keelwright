import express from 'express';
import { requireUser } from './auth.js';
import admin from './routes/admin.js';
import orders from './routes/orders.js';
import products from './routes/products.js';

const app = express();
app.use(express.json());
app.use('/products', products);
app.use('/orders', requireUser, orders);
app.use('/admin', admin);
app.listen(process.env.PORT ?? 3000);
