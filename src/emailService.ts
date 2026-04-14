import sgMail from "@sendgrid/mail";

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

sgMail.setApiKey(getEnv("SENDGRID_API_KEY"));

const FROM_EMAIL = getEnv("SENDGRID_FROM_EMAIL");
const APP_BASE_URL = process.env.APP_BASE_URL || "https://milwaukeegarbagealert.com";
const VERIFICATION_TEMPLATE_ID = "d-8d9c237cb4364cba9172da261d86a8e3";

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const verifyUrl = `${APP_BASE_URL}/verify-email?token=${token}`;

  await sgMail.send({
    to,
    from: FROM_EMAIL,
    templateId: VERIFICATION_TEMPLATE_ID,
    dynamicTemplateData: {
      verify_url: verifyUrl,
    },
  });
}
