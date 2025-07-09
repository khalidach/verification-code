// /netlify/functions/verify.js

// Import the Supabase client library
const { createClient } = require("@supabase/supabase-js");

// The main handler for the Netlify serverless function.
// It will be triggered when a request is made to /.netlify/functions/verify
exports.handler = async function (event, context) {
  // Allow requests from any origin. For production, you might want to restrict this
  // to your specific domain or application.
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  // Netlify functions can be triggered by pre-flight OPTIONS requests.
  // We need to handle these gracefully.
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers,
      body: "",
    };
  }

  // We only want to process POST requests for verification.
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: "Method Not Allowed" }),
    };
  }

  try {
    // --- 1. Initialize Supabase Client ---
    // These environment variables must be set in your Netlify project settings.
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Supabase URL or Anon Key is not set.");
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          message: "Server configuration error.",
        }),
      };
    }
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // --- 2. Get the Verification Code from the Request ---
    // Parse the incoming request body to get the code.
    const { code } = JSON.parse(event.body);

    if (!code || typeof code !== "string" || code.trim() === "") {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: "Verification code is required.",
        }),
      };
    }

    // --- 3. Query Supabase for the Code ---
    // Select the code from your `verification_codes` table.
    const { data, error: selectError } = await supabase
      .from("verification_codes")
      .select("*")
      .eq("code", code.trim())
      .single(); // .single() expects exactly one row, which is perfect for unique codes.

    // Handle any database errors during the select query.
    if (selectError && selectError.code !== "PGRST116") {
      // PGRST116 means no rows found, which we handle next.
      console.error("Supabase select error:", selectError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          message: "Database query failed.",
        }),
      };
    }

    // --- 4. Validate the Code ---
    // Check if the code was not found or if it has already been used.
    if (!data || data.is_used) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          success: false,
          message: "Invalid or already used verification code.",
        }),
      };
    }

    // --- 5. Mark the Code as Used ---
    // If the code is valid, update the database to mark it as used.
    const { error: updateError } = await supabase
      .from("verification_codes")
      .update({
        is_used: true,
        used_at: new Date().toISOString(),
      })
      .eq("id", data.id);

    // Handle any database errors during the update.
    if (updateError) {
      console.error("Supabase update error:", updateError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          message: "Failed to update code status.",
        }),
      };
    }

    // --- 6. Return Success Response ---
    // If everything is successful, return a success message.
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: "Verification successful. Access granted.",
      }),
    };
  } catch (error) {
    // Catch any other unexpected errors.
    console.error("Unexpected server error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: "An unexpected error occurred.",
      }),
    };
  }
};
