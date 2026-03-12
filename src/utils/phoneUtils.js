// ============================================
// 📱 PHONE NUMBER UTILITIES
// ============================================

/**
 * Normalize phone number to international format (254...)
 * Handles: 0712345678, 712345678, +254712345678, 254712345678
 */
export const normalizePhone = (phone) => {
    if (!phone) return null;
    
    // Remove all non-digits
    let cleaned = phone.toString().replace(/\D/g, '');
    
    // Handle different formats
    if (cleaned.startsWith('0')) {
        // 0712345678 -> 254712345678
        cleaned = '254' + cleaned.substring(1);
    } else if (cleaned.startsWith('7')) {
        // 712345678 -> 254712345678
        cleaned = '254' + cleaned;
    } else if (cleaned.startsWith('2547')) {
        // Already in correct format
        return cleaned;
    } else if (cleaned.startsWith('+254')) {
        // +254712345678 -> 254712345678
        cleaned = cleaned.substring(1);
    }
    
    // Validate length (Kenyan numbers are 12 digits with 254)
    if (cleaned.length === 12 && cleaned.startsWith('254')) {
        return cleaned;
    }
    
    // If it's a hashed value from M-PESA, return as is
    if (cleaned.length > 15) {
        return phone.toString(); // Return original hash
    }
    
    return null;
};

/**
 * Mask phone number for logging (privacy)
 * 254712345678 -> 2547******78
 */
export const maskPhone = (phone) => {
    if (!phone) return phone;
    
    const cleaned = phone.toString().replace(/\D/g, '');
    
    if (cleaned.length < 10) return '***';
    
    // Show first 4 and last 3 digits
    return cleaned.slice(0, 4) + '***' + cleaned.slice(-3);
};

/**
 * Check if phone number is valid Kenyan format
 */
export const isValidKenyanPhone = (phone) => {
    const normalized = normalizePhone(phone);
    return normalized !== null && normalized.length === 12 && normalized.startsWith('254');
};

/**
 * Extract phone from M-PESA metadata (handles both regular and hashed)
 */
export const extractPhoneFromMpesa = (msisdn, metadata = {}) => {
    // If it's a hash (64 chars), return as is
    if (msisdn && msisdn.length === 64) {
        return {
            original: msisdn,
            normalized: msisdn, // Keep hash as is
            isHashed: true
        };
    }
    
    // Regular phone number
    const normalized = normalizePhone(msisdn);
    return {
        original: msisdn,
        normalized,
        isHashed: false,
        isValid: normalized !== null
    };
};