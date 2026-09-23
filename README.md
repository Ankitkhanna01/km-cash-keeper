# Drive & Deduct

CRA-Compliant Delivery Tax Tracker App
​Goal: Create a user-friendly mobile app for self-employed Canadian delivery drivers to automate tax-deductible car expense tracking, directly supporting CRA Form T2125 filing.
​1. Core Architecture
​Design: Use a modern, high-contrast UI (Dark Mode recommended) suitable for quick interaction while driving.
​Database: Establish a secure, cloud-synced database to store Trips (kilometres) and Expenses (receipts).
​User Flow: The primary screen should be the Mileage Tracker, with secondary screens for Expenses and Reports.
​2. Automated Mileage Tracking (CRA Log)
​GPS Automation: Implement background GPS tracking that automatically starts when the user begins a trip and stops when they are stationary for more than 5 minutes. (Source 1.1, 1.5)
​Required Input: Upon a trip ending, prompt the user with a single card displaying the distance and time. The user must be able to categorize it using a simple Left Swipe (Personal) or Right Swipe (Business).
​Mandatory Data: Each "Business" trip record must save: Date, Start Time, End Time, Start Location, End Location, and Total Kilometres.
​3. AI-Powered Expense Management
​Receipt Capture: Add an in-app camera function to capture receipts.
​OCR & Classification: Integrate OCR to read the Vendor Name, Date, and Total Amount from the receipt image. Automatically classify the expense into the following categories required for CRA Form T2125: Fuel, Repairs & Maintenance, Insurance, Licence & Registration, or Interest/Leasing. (Source 2.3)
​Storage: Store the original image and the classified data securely.
​4. Tax Reporting (The Key Output)
​Annual Report: Create a "Reports" tab that allows the user to generate an audit-ready, downloadable PDF for any specified tax year.
​Required Calculation: The report must clearly show the Business-Use Percentage by dividing Total Business Kilometres by Total Annual Kilometres.
​T2125 Summary: The final report must summarize the total deductible amounts for all expense categories, formatted clearly for easy transfer to CRA Form T2125 (Statement of Business or Professional Activities).

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://km-cash-keeper.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/48b9e0b4-8767-4f81-be23-8066bd7743a6).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
