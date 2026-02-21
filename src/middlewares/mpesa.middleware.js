import ipRangeCheck from 'ip-range-check';

/**
 * 🛡️ MPESA IP WHITELIST (2026 Production Optimized)
 * Validates that incoming requests originate from Safaricom's official servers.
 */
export const mpesaIpWhitelist = (req, res, next) => {
    // 1. Extract the true client IP from Render's proxy header
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip;

    // 2. Official Safaricom Daraja Production Ranges (2026)
    const safaricomIps = [
        // Static Legacy IPs
        '196.201.214.200', '196.201.214.206', '196.201.213.114',
        '196.201.214.207', '196.201.214.208', '196.201.213.44',
        '196.201.212.127', '196.201.212.138', '196.201.212.129',
        '196.201.212.136', '196.201.212.74', '196.201.212.69',
        
        // CIDR Blocks (Validated for 2026)
        '196.201.214.0/24', 
        '196.201.212.0/24', 
        '196.201.213.0/24',
        '196.201.208.0/20' // Expanded Safaricom Limited block
    ];

    // 3. Perform the check
    // ipRangeCheck handles both exact IPs and CIDR ranges automatically
    const isSafaricom = ipRangeCheck(clientIp, safaricomIps);

    // 4. Security Logic
    if (process.env.MPESA_ENVIRONMENT === 'production') {
        if (!isSafaricom) {
            console.warn(`🚨 [SECURITY]: Blocked unauthorized access attempt from IP: ${clientIp}`);
            
            /**
             * Note: We return 200 to Safaricom standards to prevent 
             * continuous retries from unknown scanners, but we exit early.
             */
            return res.status(200).json({ 
                ResultCode: 0, 
                ResultDesc: "Accepted" 
            });
        }
        console.log(`✅ [SECURITY]: Validated Safaricom IP: ${clientIp}`);
    }

    next();
};