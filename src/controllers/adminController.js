import { supabase } from '../config/supabase.js';

export const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // 1. Authenticate with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      return res.status(401).json({ message: authError.message });
    }

    // 2. Fetch extra profile data from our custom 'admins' table
    const { data: adminProfile, error: profileError } = await supabase
      .from('admins')
      .select('role, full_name')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !adminProfile) {
      return res.status(403).json({ message: "Access denied: Not an authorized admin." });
    }

    // 3. Return combined session and profile data
    return res.status(200).json({
      message: "Login successful",
      session: authData.session,
      user: {
        id: authData.user.id,
        email: authData.user.email,
        role: adminProfile.role,
        name: adminProfile.full_name
      }
    });

  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Retrieves the profile of the currently authenticated admin.
 * Assumes 'req.admin' is populated by the 'protect' middleware.
 */
export const getAdminProfile = async (req, res) => {
  try {
    // req.admin is set by the 'protect' middleware after token verification
    if (!req.admin) {
      return res.status(404).json({ message: "Admin profile not found" });
    }
    
    return res.status(200).json({
      user: req.admin
    });
  } catch (error) {
    console.error("Get Profile Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Updates the password for the currently logged-in admin.
 */
export const updateAdminPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long" });
    }

    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    return res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Update Password Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};