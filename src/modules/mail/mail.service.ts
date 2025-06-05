import fs from "fs/promises";
import handlebars from "handlebars";
import nodemailer, { Transporter } from "nodemailer";
import path from "path";
import { env } from "../../config";

export class MailService {
  private transporter: Transporter;
  private templatesDir: string;

  constructor() {
    const isTestEnv = process.env.NODE_ENV === "test";

    this.transporter = nodemailer.createTransport(
      isTestEnv
        ? {
            host: "localhost",
            port: 1025,
            secure: false,
          }
        : {
            service: "gmail",
            auth: {
              user: env().MAIL_USER,
              pass: env().MAIL_PASSWORD,
            },
          },
    );

    this.templatesDir = path.resolve(__dirname, "./templates");
  }

  private async renderTemplate(
    templateName: string,
    context: object,
  ): Promise<string> {
    const templatePath = path.join(this.templatesDir, `${templateName}.hbs`);

    // Read the template file
    const templateSource = await fs.readFile(templatePath, "utf-8");

    // Compile the template
    const compiledTemplate = handlebars.compile(templateSource);

    // Return the rendered template
    return compiledTemplate(context);
  }

  public async sendEmail(
    to: string,
    subject: string,
    templateName: string,
    context: object,
  ): Promise<void> {
    try {
      const html = await this.renderTemplate(templateName, context);

      const mailOptions = {
        from: `"Bubblify" <${env().MAIL_USER}>`,
        to,
        subject,
        html,
      };

      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      throw "Error sending email";
    }
  }

  public async sendVerificationEmail(
    to: string,
    verificationLink: string,
    userName?: string,
  ): Promise<void> {
    const subject = "Verify your Bubblify account";
    const templateName = "verification-email";
    const context = {
      verificationLink,
      userName,
      currentYear: new Date().getFullYear(),
    };

    await this.sendEmail(to, subject, templateName, context);
  }

  public async sendResetPasswordEmail(
    to: string,
    resetPasswordLink: string,
    userName?: string,
  ): Promise<void> {
    const subject = "Reset password for your Bubblify account";
    const templateName = "reset-password-email";
    const context = {
      resetPasswordLink,
      userName,
      currentYear: new Date().getFullYear(),
    };

    await this.sendEmail(to, subject, templateName, context);
  }
}
