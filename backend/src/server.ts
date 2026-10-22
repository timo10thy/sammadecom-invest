import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { authRouter } from "./modules/auth/authRoutes.js";
import { startTokenCleanupJob } from "./jobs/tokenCleanup.js";
import { investorsRouter } from "./modules/investors/investorsRoutes.js";
import { investmentsRouter } from "./modules/investments/investmentsRoutes.js";
import { paymentsRouter } from "./modules/payments/paymentsRoutes.js";
import { auditLogsRouter } from "./modules/audit/auditLogsRoutes.js";
const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use(globalLimiter);

app.use("/auth", authRouter);
app.use("/investors", investorsRouter);
app.use("/investments", investmentsRouter);
app.use("/payments", paymentsRouter);
app.use("/audit-logs", auditLogsRouter);


app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startTokenCleanupJob();
});