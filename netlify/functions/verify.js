// /netlify/functions/verify.js

// Import the Supabase client library
const { createClient } = require("@supabase/supabase-js");

// The main handler for the Netlify serverless function.
exports.handler = async function (event, context) {
  // CORS headers to allow requests from your application
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  // Handle pre-flight OPTIONS requests
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers,
      body: "",
    };
  }

  // Ensure the request is a POST request
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: "Method Not Allowed" }),
    };
  }

  try {
    // --- 1. Initialize Supabase Client ---
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

    // --- 2. Get Code and Machine ID from Request ---
    const { code, machineId } = JSON.parse(event.body);

    if (!code || !machineId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: "Verification code and machine ID are required.",
        }),
      };
    }

    // --- 3. Query Supabase for the Code ---
    const { data: codeData, error: selectError } = await supabase
      .from("verification_codes")
      .select("*")
      .eq("code", code.trim())
      .single();

    if (selectError && selectError.code !== "PGRST116") {
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

    // If code doesn't exist at all
    if (!codeData) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          success: false,
          message: "Invalid verification code.",
        }),
      };
    }

    // --- 4. Validate the Code ---
    if (codeData.is_used) {
      // If the code is used, check if it's for the same machine
      if (codeData.machine_id === machineId) {
        // It's the same machine re-verifying, which is allowed.
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: "Verification successful.",
          }),
        };
      } else {
        // The code is used, but on a different machine. Deny access.
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({
            success: false,
            message: "This code has already been used on another computer.",
          }),
        };
      }
    } else {
      // --- 5. First-Time Activation: Mark the Code as Used ---
      const { error: updateError } = await supabase
        .from("verification_codes")
        .update({
          is_used: true,
          used_at: new Date().toISOString(),
          machine_id: machineId, // Store the machine ID
        })
        .eq("id", codeData.id);

      if (updateError) {
        console.error("Supabase update error:", updateError);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            success: false,
            message: "Failed to activate code.",
          }),
        };
      }

      // --- 6. Return Success Response for First-Time Activation ---
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: "Application activated successfully.",
        }),
      };
    }
  } catch (error) {
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
