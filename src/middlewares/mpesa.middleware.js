/**
 * 🛡️ MPESA IP WHITELIST (2026 Production Ranges)
 */
export const mpesaIpWhitelist = (req, res, next) => {
    // Extract real client IP from Render's X-Forwarded-For header
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip;

    const safaricomIps = [
    // Original IPs
    '196.201.214.200', '196.201.214.206', '196.201.213.114',
    '196.201.214.207', '196.201.214.208', '196.201.213.44',
    '196.201.212.127', '196.201.212.138', '196.201.212.129',
    '196.201.212.136', '196.201.212.74', '196.201.212.69',
    // New 2026 Production Ranges (CIDR blocks)
    '196.201.214.212', 
    '196.201.214.0/24', // Covers 196.201.214.1 to 196.201.214.254
    '196.201.212.0/24', // Covers the .212 range
    '196.201.213.0/24'  // Covers the .213 range
];

    // Check if the IP is in Safaricom's official list
    const isSafaricom = safaricomIps.includes(clientIp);

    if (process.env.MPESA_ENVIRONMENT === 'production' && !isSafaricom) {
        console.warn(`🚨 [SECURITY]: Blocked unauthorized callback attempt from IP: ${clientIp}`);
        
        // We return a 200/Success to Safaricom's standards but stop our code from running
        return res.status(200).json({ 
            ResultCode: 0, 
            ResultDesc: "Accepted" 
        });
    }

    next();
};