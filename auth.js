// Authentication Module

/**
 * Sign up a new user
 */
async function signUp(email, password) {
    const { data, error } = await window.supabaseClient.auth.signUp({
        email: email,
        password: password,
        options: {
            emailRedirectTo: window.location.origin + '/index.html'
        }
    });

    if (error) throw error;
    return data;
}

/**
 * Sign in existing user
 */
async function signIn(email, password) {
    const { data, error } = await window.supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
    });

    if (error) throw error;
    return data;
}

/**
 * Sign out current user
 *
 */
async function signOut() {
    try {
        const { error } = await window.supabaseClient.auth.signOut();
        if (error) console.error("Logout error:", error);
    } catch (e) {
        console.error("Logout exception:", e);
    } finally {
        // Force clear any local session data to prevent auto-login loop
        localStorage.clear();

        // Always redirect, even if API fails
        window.location.href = 'login.html';
    }
}

/**
 * Get current user session
 */
async function getUser() {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    return session?.user || null;
}

/**
 * Check if user is authenticated, redirect to login if not
 */
async function requireAuth() {
    const user = await getUser();
    if (!user) {
        window.location.href = 'login.html';
        return null;
    }
    return user;
}

/**
 * Check if already logged in, redirect to app if so
 */
async function redirectIfAuthenticated() {
    const user = await getUser();
    if (user) {
        window.location.href = 'index.html';
        return true;
    }
    return false;
}

/**
 * Send password reset email
 */
async function sendPasswordReset(email) {
    const { error } = await window.supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/login.html',
    });
    if (error) throw error;
}

/**
 * Update user password (used after clicking reset link)
 */
async function updatePassword(newPassword) {
    const { error } = await window.supabaseClient.auth.updateUser({
        password: newPassword
    });
    if (error) throw error;
}

// Export functions
window.auth = {
    signUp,
    signIn,
    signOut,
    getUser,
    requireAuth,
    redirectIfAuthenticated,
    sendPasswordReset,
    updatePassword
};
