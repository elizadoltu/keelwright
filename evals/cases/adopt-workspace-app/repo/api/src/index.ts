import cors from 'cors';
import express from 'express';
import { items } from './routes/items.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/items', items);
app.listen(Number(process.env.PORT ?? 3001));
