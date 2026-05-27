// src/config/pinecone.js
import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';

dotenv.config();

const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY
});

// Target your index
export const pineconeIndex = pc.index("airesponse");
