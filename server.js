import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.post('/send-welcome-email', async (req, res) => {
  const { email, displayName, username } = req.body;

  if (!email || !displayName || !username) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev', // safe test sender
        to: email,
        subject: `Welcome to MainWRLD, ${displayName}`,
        html: `
          <p>Hi ${displayName},</p>
          <p>Welcome to MainWRLD! Your username is <strong>@${username}</strong>.</p>
          <p>Jump in and start building your world.</p>
        `,
      }),
    });

    const data = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({ error: data });
    }

    console.log('[MainWRLD] Email sent to', email);
    res.json({ success: true });

  } catch (err) {
    console.error('[MainWRLD] Email failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(process.env.PORT, () => {
  console.log(`🚀 Server running on http://localhost:${process.env.PORT}`);
});