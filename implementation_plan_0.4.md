# Plastic Raw Material Trading App - Implementation Plan

## Goal Description
Develop an intuitive, minimalist Progressive Web App (PWA) to digitalize a plastic raw material trading business. The app will replace manual receipt books by tracking sales, purchases, inventory, expenses, and profits. It will support role-based access control and provide a scalable foundation built around Google Services to keep operational costs free.

## Technology Stack Recommendation
- **Framework**: **React with Vite (PWA)**. Allows rapid local development, stunning web UI, and can be installed on Android phones just like a native app without App Store deployment. 
- **Backend/Database**: **Google Drive API & Google Sheets API**. To avoid expensive database subscriptions, the app will use Google Sheets as its backend database. Tables will map to Sheets/Tabs, providing robust data retention, free storage, and the ability for the owner to manually review or export the raw data easily. The app will securely authenticate to the business Google Account.

## User Roles & Access Control
1. **Business Owner**: Full access. Can view the comprehensive dashboard, profit reports, monthly supply-demand overview, inventory status, toggle app features, and manage all data.
2. **Business Manager**: Operational access. Can record sales, purchases, and expenses. Can add/manage Master Data entries (Materials, Customers, Suppliers). Cannot view overall profit margins or business analytics.

## Core Modules & Database Schema Outline (Google Sheets Tabs)

### 1. Master Data (Configurable Entities)
- **Materials**: Material Name, Description, Current Stock (Generic Pool measured in total KG/Bags), Default Tax Rate (e.g. 9% CGST & SGST or 18% IGST - configurable but defaults for most materials), Default Purchase Price, Default Selling Price.
- **Parties (Customers/Suppliers)**: Name, GSTIN, Contact Info, Address, Type (Buyer/Supplier).
- **Payment Modes**: Cash, Cheque, Card, Bank Transfer.

### 2. Sales (Outward)
- **Invoice/Receipt**: 
  - *Header*: Invoice No, Challan No, Invoice Date, Order Date, Challan Date, Customer (linked to Party), Order Type.
  - *Items*: List of (Material, No. of Bags, Weight in KG, Rate per KG, Amount).
  - *Summary*: Total Amount, CGST, SGST, IGST (Dynamically calculated based on Material's default rate, but can be overridden manually per invoice), Grand Total (Payable).
  - *Payment Details*: Payment Mode, Payment Status (Pending, Confirmed), Grace Period (e.g., 30 Days), Payment Confirmation Date.

### 3. Purchases (Inward)
- Similar structure to Sales, but linked to Suppliers. Affects average purchase price and directly adds to inventory stock pool.

### 4. Inventory Management
- Automatically calculated based on Purchases (Inward) minus Sales (Outward).
- Tracks individual material stock in generic pools of KG and Bags.
- Computes profit per sale based on `(Selling Rate - Average Purchase Rate) * KG`.

### 5. Expenses
- Tracks daily operational business expenses (Date, Category, Amount, Description).

### 6. Dashboards & Alerts
- **Owner Dashboard**:
  - Monthly Supply and Demand overview.
  - Monthly and Quarterly profit and loss (P&L) tracking.
  - Detailed Inventory alerts.
- **Big Screen Overview (Web Advantage)**:
  - Since this is a web app, the Business Owner can simply open the URL from their PC/Laptop Chrome browser for a full desktop-optimized dashboard view without needing any local server routing.
- **Notifications / Alerts**:
  - The application will automatically scan outstanding sales and present a dedicated notification/report of invoices where payment is NOT updated or confirmed, AND more than 30 days have elapsed since the invoice date.

## UI/UX Flow (Minimalist & Intuitive)
- **Google Sign-In**: Secure access authorizing Google Sheets read/write.
- **Home/Dashboard (Owner)**: High-level metrics, P&L graphs, Overdue Payment alerts.
- **Home/Dashboard (Manager)**: Quick Action buttons (New Sale, New Purchase, Add Expense).
- **Transaction Entry Forms**: Clean, scrollable forms with dropdowns for Master Data (preventing manual typing errors), auto-calculating totals and taxes. 
- **Record List View**: Searchable, filterable list of past invoices/purchases.

## Phased Deployment Strategy
1. **Basic MVP**: Google Sheets Integration setup, Master data management, Sales/Purchase entry, Basic Inventory tracking.
2. **Financials Add-on**: Expense tracking, Payment tracking with 30-day overdue alerts, Profit & Loss Owner Dashboard.
3. **Future Expansions**: Digital PDF Invoice generation, Bluetooth Thermal Printer integration.
