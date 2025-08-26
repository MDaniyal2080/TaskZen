import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";
import { SystemSettingsService } from "../../common/services/system-settings.service";

@Injectable()
export class EmailService {
  constructor(
    private readonly configService: ConfigService,
    private readonly settingsService: SystemSettingsService,
  ) {}

  private async getEmailConfig() {
    const settings = await this.settingsService.getSettings();
    const email = (settings as any)?.email || {};
    const enabled = Boolean(email?.enabled);
    const provider = String(email?.provider || "smtp");
    const fromEmail = String(
      email?.fromEmail ||
        this.configService.get("SMTP_USER") ||
        "noreply@taskzen.app",
    );
    const fromName = String(email?.fromName || "TaskZen");
    const templates = (email?.templates || {}) as any;
    return { enabled, provider, fromEmail, fromName, templates, raw: email };
  }

  private buildTransporter(emailCfg: any): nodemailer.Transporter | null {
    if (!emailCfg?.enabled) return null;
    if ((emailCfg?.provider || "smtp") !== "smtp") return null;
    const host = emailCfg?.raw?.smtpHost || "smtp.gmail.com";
    const port = Number(emailCfg?.raw?.smtpPort || 587);
    const user = emailCfg?.raw?.smtpUser || undefined;
    const pass = emailCfg?.raw?.smtpPassword || undefined;
    const secure = port === 465; // common convention
    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  async sendWelcomeEmail(email: string, username: string) {
    const cfg = await this.getEmailConfig();
    if (!cfg.enabled || cfg.templates?.welcome === false) {
      return {
        success: false,
        error: "Email service disabled or template off",
      };
    }
    const transporter = this.buildTransporter(cfg);
    if (!transporter)
      return { success: false, error: "No transporter available" };

    const mailOptions = {
      from: `"${cfg.fromName}" <${cfg.fromEmail}>`,
      to: email,
      subject: "Welcome to TaskZen! 🎉",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #6366f1;">Welcome to TaskZen, ${username}!</h1>
          <p>We're excited to have you on board. TaskZen is your new favorite Kanban board for managing tasks and projects.</p>
          <p>Here's what you can do with TaskZen:</p>
          <ul>
            <li>Create and manage Kanban boards</li>
            <li>Collaborate with team members</li>
            <li>Track deadlines and priorities</li>
            <li>Organize tasks with drag-and-drop</li>
          </ul>
          <a href="${this.configService.get("FRONTEND_URL")}/boards" 
             style="display: inline-block; padding: 12px 24px; background-color: #6366f1; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px;">
            Get Started
          </a>
          <p style="margin-top: 30px; color: #666;">
            Best regards,<br>
            The TaskZen Team
          </p>
        </div>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      return { success: true };
    } catch (error) {
      console.error("Email send error:", error);
      return { success: false, error: error.message };
    }
  }

  async sendPasswordResetEmail(email: string, resetToken: string) {
    const cfg = await this.getEmailConfig();
    if (!cfg.enabled || cfg.templates?.passwordReset === false) {
      return {
        success: false,
        error: "Email service disabled or template off",
      };
    }
    const transporter = this.buildTransporter(cfg);
    if (!transporter)
      return { success: false, error: "No transporter available" };

    const resetUrl = `${this.configService.get("FRONTEND_URL")}/reset-password?token=${resetToken}`;
    const mailOptions = {
      from: `"${cfg.fromName}" <${cfg.fromEmail}>`,
      to: email,
      subject: "Reset Your Password - TaskZen",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #6366f1;">Password Reset Request</h1>
          <p>You requested to reset your password. Click the button below to create a new password:</p>
          <a href="${resetUrl}" 
             style="display: inline-block; padding: 12px 24px; background-color: #6366f1; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">
            Reset Password
          </a>
          <p style="color: #666;">Or copy and paste this link in your browser:</p>
          <p style="word-break: break-all; color: #6366f1;">${resetUrl}</p>
          <p style="margin-top: 30px; color: #666;">
            If you didn't request this, please ignore this email.<br><br>
            Best regards,<br>
            The TaskZen Team
          </p>
        </div>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      return { success: true };
    } catch (error) {
      console.error("Email send error:", error);
      return { success: false, error: error.message };
    }
  }

  async sendInvitationEmail(
    email: string,
    boardName: string,
    inviterName: string,
    inviteToken: string,
  ) {
    const cfg = await this.getEmailConfig();
    if (!cfg.enabled) {
      return { success: false, error: "Email service disabled" };
    }
    const transporter = this.buildTransporter(cfg);
    if (!transporter)
      return { success: false, error: "No transporter available" };

    const inviteUrl = `${this.configService.get("FRONTEND_URL")}/invite?token=${inviteToken}`;
    const mailOptions = {
      from: `"${cfg.fromName}" <${cfg.fromEmail}>`,
      to: email,
      subject: `You're invited to join "${boardName}" on TaskZen`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #6366f1;">You're Invited! 🎉</h1>
          <p>${inviterName} has invited you to collaborate on the board "<strong>${boardName}</strong>" on TaskZen.</p>
          <a href="${inviteUrl}" 
             style="display: inline-block; padding: 12px 24px; background-color: #6366f1; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">
            Accept Invitation
          </a>
          <p style="color: #666;">Or copy and paste this link in your browser:</p>
          <p style="word-break: break-all; color: #6366f1;">${inviteUrl}</p>
          <p style="margin-top: 30px; color: #666;">
            Best regards,<br>
            The TaskZen Team
          </p>
        </div>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      return { success: true };
    } catch (error) {
      console.error("Email send error:", error);
      return { success: false, error: error.message };
    }
  }

  async sendDeadlineReminderEmail(
    email: string,
    username: string,
    cardTitle: string,
    dueDate: Date,
  ) {
    const cfg = await this.getEmailConfig();
    if (!cfg.enabled) {
      return { success: false, error: "Email service disabled" };
    }
    const transporter = this.buildTransporter(cfg);
    if (!transporter)
      return { success: false, error: "No transporter available" };

    const mailOptions = {
      from: `"${cfg.fromName}" <${cfg.fromEmail}>`,
      to: email,
      subject: `⏰ Deadline Reminder: "${cardTitle}"`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #ef4444;">Deadline Approaching!</h1>
          <p>Hi ${username},</p>
          <p>This is a reminder that the task "<strong>${cardTitle}</strong>" is due on:</p>
          <p style="font-size: 18px; color: #6366f1; font-weight: bold;">
            ${new Date(dueDate).toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <a href="${this.configService.get("FRONTEND_URL")}/boards" 
             style="display: inline-block; padding: 12px 24px; background-color: #6366f1; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px;">
            View Task
          </a>
          <p style="margin-top: 30px; color: #666;">
            Best regards,<br>
            The TaskZen Team
          </p>
        </div>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      return { success: true };
    } catch (error) {
      console.error("Email send error:", error);
      return { success: false, error: error.message };
    }
  }
}
