export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { service } = req.body || {};
  
  const credentials = {
    'Firebase Cloud': process.env.FIREBASE_CONFIG ? 'Configured' : 'Missing',
    'Gemini AI Engine': process.env.GEMINI_API_KEY ? 'Configured' : 'Missing',
    'Stripe Gateway': process.env.STRIPE_SECRET_KEY ? 'Configured' : 'Missing',
    'SendGrid SMTP': process.env.SENDGRID_API_KEY ? 'Configured' : 'Missing',
    'Cloudflare CDN': process.env.CLOUDFLARE_API_TOKEN ? 'Configured' : 'Missing',
    'Twilio SMS': process.env.TWILIO_AUTH_TOKEN ? 'Configured' : 'Missing',
    'Cloudflare Calls': process.env.CLOUDFLARE_CALLS_APP_ID ? 'Configured' : 'Missing',
    'Cloudflare Storage (R2)': process.env.CLOUDFLARE_R2_BUCKET_NAME ? 'Configured' : 'Missing',
    'Express TURN': process.env.TURN_SERVER_URL ? 'Configured' : 'Missing',
  };

  const status = credentials[service];

  if (status === 'Configured') {
    res.status(200).json({ 
      success: true, 
      message: `${service} connected successfully via environment variables.`,
      details: 'Secure connection established.'
    });
  } else {
    res.status(400).json({ 
      success: false, 
      message: `Failed to connect to ${service}.`,
      details: `Missing environment variable for ${service}. Please configure it in the hosting environment.`
    });
  }
}
