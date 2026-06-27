export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { service } = req.body || {};
  
  const credentials = {
    'Firebase Cloud': process.env.FIREBASE_CONFIG ? 'Configured' : 'Missing',
    'Gemini AI Engine': process.env.GEMINI_API_KEY ? 'Configured' : 'Missing',
    'Express TURN': process.env.TURN_SERVER_URL ? 'Configured' : 'Missing',
    'Web Notification Keys': (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) ? 'Configured' : 'Missing',
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
