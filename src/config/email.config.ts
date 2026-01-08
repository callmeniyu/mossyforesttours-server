export const emailConfig = {
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER || '', // your email
      pass: process.env.SMTP_PASS || '', // your email password or app password
    },
    tls: {
      rejectUnauthorized: false
    }
  },
  from: {
    name: process.env.FROM_NAME || 'Mossy Forest Tours',
    email: process.env.FROM_EMAIL || process.env.SMTP_USER || 'noreply@mossyforesttours.my',
  },
  templates: {
    logo: process.env.COMPANY_LOGO || 'https://mossyforest.my/logo.png',
    website: process.env.COMPANY_WEBSITE || 'https://mossyforest.my',
    supportEmail: process.env.SUPPORT_EMAIL || 'support@mossyforest.my',
    supportPhone: process.env.SUPPORT_PHONE || '+60 19-659 2141',
    notificationEmail: process.env.NOTIFICATION_EMAIL || 'mossyforesttours@gmail.com', // Admin notification email
  }
};
