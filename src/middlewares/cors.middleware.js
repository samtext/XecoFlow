import cors from 'cors';

// 🚨 UPDATE: Add your real frontend domain here (e.g., Netlify/Vercel)
const whitelist = [
    'https://your-frontend-site.netlify.app', 
    'http://localhost:3000', // Local development
    'http://localhost:5173'
];

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);
        
        if (whitelist.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.error(`🚫 [CORS BLOCKED]: Attempt from ${origin}`);
            callback(new Error('Not allowed by CORS security policy'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};

export default cors(corsOptions);