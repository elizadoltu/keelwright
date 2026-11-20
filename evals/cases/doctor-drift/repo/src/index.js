import express from 'express';
import { listOrders } from './handlers/orders.js';

const app = express();
app.get('/orders', listOrders);
app.listen(3000);
