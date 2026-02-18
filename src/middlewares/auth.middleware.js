import { supabase } from '../config/supabase.js';

/**
 * Main Authentication Middleware
 * Verifies the user's session token and attaches admin data to the request.
 */
export const protect = async (req, res, next) => {
  let token;

  // 1. Check if token exists in Headers (Bearer Token)
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: "Not authorized, no token provided." });
  }

  try {
    // 2. Verify the token with Supabase Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ message: "Session expired or invalid token." });
    }

    // 3. Verify the user is actually in our 'admins' table
    const { data: adminProfile, error: profileError } = await supabase
      .from('admins')
      .select('role, full_name')
      .eq('id', user.id)
      .single();

    if (profileError || !adminProfile) {
      return res.status(403).json({ message: "Access denied: Unauthorized admin account." });
    }

    // 4. Attach admin info to the Request object for use in controllers
    req.admin = {
      id: user.id,
      email: user.email,
      role: adminProfile.role,
      name: adminProfile.full_name
    };

    next();
  } catch (error) {
    console.error("Auth Middleware Error:", error);
    return res.status(500).json({ message: "Internal server error during authentication." });
  }
};

/**
 * Role-Based Authorization Middleware
 * Only allows specific roles (e.g., 'superadmin') to access certain routes.
 */
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.admin.role)) {
      return res.status(403).json({ 
        message: `Forbidden: Role '${req.admin.role}' does not have permission to perform this action.` 
      });
    }
    next();
  };
};