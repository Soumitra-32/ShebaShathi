# Repository instructions

Before changing project files, read `docs/PLANNER.md` and `docs/SECURITY_ASSESSMENT.md`.

For every code change, follow the security workflow in `docs/SECURITY_ASSESSMENT.md`: assess affected data flows before implementation, apply its relevant controls while coding, then perform and report a separate self-audit after implementation. Fix critical/high findings before reporting completion; state any checks not run and remaining risks.

Keep the existing technology stack and product scope. Do not modify `ml_core/` unless the user explicitly authorizes work there. Do not collect or persist identity numbers, document images, OTPs, credentials, or other sensitive identity data.
