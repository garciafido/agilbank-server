import { PrismaClient, Prisma } from "../generated-client/client";
import { upsertOne } from "./utils";
import {
  generateResetToken,
  hashToken,
  getTokenExpiration,
} from "../../common/utils/passwordUtils";
import { getEmailService } from "../../utils/email/email.service";
import { hash } from "bcrypt";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

const data: Partial<Prisma.UserCreateInput>[] = [
  {
    id: "SYSTEM",
    createdAt_: new Date(),
    version_: "0",
    name: "SYSTEM",
    email: "SYSTEM",
    password: "",
    active: true,
  },
  {
    id: "SYSADMIN",
    createdAt_: new Date(),
    version_: "0",
    name: "SysAdmin",
    email: "garciafido@gmail.com",
    password: "",
    active: true,
  },
];

export const seedUsers = async (prisma: PrismaClient) => {
  const generatedTokens: Array<[string, string, string]> = []; // [name, email, token]
  const failedEmails: Array<[string, string, string]> = [];

  for (let x of data) {
    // Un usuario existente NO se toca: ni su password (la eligió él) ni su
    // token de activación. El seed garantiza que los usuarios del sistema
    // existan — no re-inicializa credenciales en cada corrida como dependencia.
    const alreadyExists = !!(await prisma.user.findUnique({
      where: { id: x.id as string },
      select: { id: true },
    }));

    // Generate a placeholder password (user will set their own via activation link)
    const placeholderPassword = generateResetToken();
    const hashedPassword = await hash(placeholderPassword, 10);
    x.password = hashedPassword; // create-only: el update nunca lo pisa (ver upsertOne)

    try {
      let user;
      try {
        x = { ...x, tenant_: { connect: { id: "AGILMIND" } } };
        if (x.id === "SYSTEM") {
          await upsertOne(prisma, "tenant", {
            id: "AGILMIND",
            name: "AGILMIND",
            createdBy_: undefined,
            lastUpdatedBy_: undefined,
          });
          user = await upsertOne(
            prisma,
            "user",
            { ...x, createdBy_: undefined, lastUpdatedBy_: undefined },
            undefined,
            ["password"]
          );
          await prisma.user.update({
            data: {
              createdBy_: { connect: { id: "SYSTEM" } },
              lastUpdatedBy_: { connect: { id: "SYSTEM" } },
            },
            where: { id: "SYSTEM" },
          });
          await prisma.tenant.update({
            data: {
              createdBy_: { connect: { id: "SYSTEM" } },
              lastUpdatedBy_: { connect: { id: "SYSTEM" } },
            },
            where: { id: "AGILMIND" },
          });
        } else {
          user = await upsertOne(prisma, "user", x, undefined, ["password"]);
        }
      } catch (error) {
        throw error;
      }
      console.log(
        `${alreadyExists ? "Upserted" : "Created"} user id: ${user.id}`
      );

      // Send activation email only to NEW users (never SYSTEM)
      if (x.id !== "SYSTEM" && !alreadyExists) {
        // Generate activation token
        const token = generateResetToken();
        const tokenHash = hashToken(token);
        const expiresAt = getTokenExpiration(1); // 1 hour

        // Save token hash to user record
        await prisma.user.update({
          data: {
            passwordResetToken: tokenHash,
            passwordResetExpiresAt: expiresAt,
          },
          where: { id: user.id },
        });

        generatedTokens.push([x.name as string, x.email as string, token]);

        try {
          const emailService = getEmailService();
          await emailService.sendWelcomeEmail(x.email as string, {
            name: x.name as string,
            token,
            language: "es",
          });
          console.log(`✉️  Activation email processed for ${x.email}`);
        } catch (emailError) {
          console.warn(
            `⚠️  Critical error processing email for ${x.email}: ${
              emailError instanceof Error ? emailError.message : "Unknown error"
            }`
          );
          failedEmails.push([x.name as string, x.email as string, token]);
        }
      }
    } catch (e) {
      console.log(`Error on: ${JSON.stringify(x, null, 2)}`);
      throw e;
    }
  }

  // Check if SMTP is fully configured
  const isSmtpConfigured = !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD &&
    process.env.SMTP_FROM
  );

  // Save activation links if email failed or SMTP not configured
  const tokensToSave = !isSmtpConfigured ? generatedTokens : failedEmails;

  if (tokensToSave.length > 0) {
    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const activationLinks = tokensToSave
      .map((x) => `"${x[1]}": "${appUrl}/reset-password?token=${x[2]}"`)
      .join("\n");

    const isProduction =
      process.env.NODE_ENV === "production" ||
      process.env.DATABASE_URL?.includes("postgres:5432") ||
      __dirname.startsWith("/app/");

    const backupDir = isProduction ? "/app/backups/seed" : ".";
    const filePath = `${backupDir}/created_users.txt`;

    try {
      if (isProduction) {
        try {
          mkdirSync(backupDir, { recursive: true });
        } catch (e) {
          // Directory might already exist
        }
      }

      writeFileSync(filePath, activationLinks, { flag: "w" });

      if (!isSmtpConfigured) {
        console.log("\n📧 Email Status: SMTP not configured");
        console.log("   Activation links saved to file instead");
      } else {
        console.log(`\n❌ Email failures for ${failedEmails.length} user(s).`);
      }
      console.log(`🔗 Activation links saved to: ${filePath}`);
      console.log("\nActivation links:");
      console.log(activationLinks);
    } catch (error) {
      console.warn(
        `⚠️  Could not write to ${filePath}, trying current directory...`
      );
      writeFileSync("created_users.txt", activationLinks, { flag: "w" });
      console.log(`📝 Activation links saved to created_users.txt`);
    }
  }

  // Show summary
  if (generatedTokens.length > 0) {
    const successCount = generatedTokens.length - failedEmails.length;

    if (isSmtpConfigured && failedEmails.length === 0) {
      console.log(`\n✅ All activation emails sent successfully!`);
      console.log(`   ${generatedTokens.length} user(s) created and notified.`);
    } else if (isSmtpConfigured) {
      console.log(
        `\n⚠️  Mixed results: ${successCount} emails sent, ${failedEmails.length} failures`
      );
    } else {
      console.log(`\n✅ ${generatedTokens.length} user(s) created.`);
      console.log("   Configure SMTP to send activation emails automatically.");
    }
  }
};
