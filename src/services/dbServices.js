/**
 * BIG-SYSTEM-V1.2 | DATABASE SERVICE
 * FILE: dbServices.js
 */
import { db } from '../config/db.js';
import { v4 as uuidv4 } from 'uuid'; 

class DbService {
    async createTransactionRecord(phone, amount, userId) {
        if (!userId) {
            throw new Error("SYSTEM_RULE_VIOLATION: user_id is missing.");
        }

        console.log(`📝 DB_SERVICE: Initializing record for ${phone}...`);
        
        // Use 'network' instead of 'provider' based on common M-Pesa schemas
        const { data, error } = await db.transactions().insert([{
            user_id: userId,
            amount: amount,
            phone_number: phone,
            network: 'SAFARICOM',           // Changed back to 'network'
            status: 'INITIATED',
            idempotency_key: uuidv4(),
            metadata: { source: 'integrated_test_v1' }
        }]).select().single();

        if (error) {
            // If it fails again, check if your column is actually named 'service_provider' 
            console.error("📑 DB ERROR DETAILS:", error);
            throw new Error(`DB_INIT_ERROR: ${error.message}`);
        }

        console.log(`✅ DB_SERVICE: Record created. ID: ${data.id}`);
        return data;
    }

    async linkCheckoutId(internalId, checkoutId) {
        console.log(`🔗 DB_SERVICE: Linking CheckoutID ${checkoutId}...`);
        
        const { error } = await db.transactions()
            .update({ 
                checkout_id: checkoutId, 
                status: 'PENDING_PAYMENT' 
            })
            .eq('id', internalId);

        if (error) throw new Error(`DB_LINK_ERROR: ${error.message}`);
        return true;
    }
}

export default new DbService();