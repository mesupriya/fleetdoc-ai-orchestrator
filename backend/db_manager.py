import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "fleet.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db(force=False):
    if force and os.path.exists(DB_PATH):
        os.remove(DB_PATH)
        
    db_exists = os.path.exists(DB_PATH)
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Create Tables
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS trucks (
        truck_id TEXT PRIMARY KEY,
        make TEXT NOT NULL,
        model TEXT NOT NULL,
        year INTEGER NOT NULL,
        license_plate TEXT NOT NULL,
        status TEXT NOT NULL
    )
    """)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS drivers (
        driver_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        license_number TEXT NOT NULL,
        status TEXT NOT NULL
    )
    """)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS documents (
        document_id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_name TEXT NOT NULL,
        document_type TEXT NOT NULL,
        upload_date TEXT NOT NULL,
        truck_id TEXT,
        driver_id TEXT,
        trailer_id TEXT,
        vendor TEXT,
        amount REAL,
        date TEXT,
        expiry_date TEXT,
        raw_text TEXT NOT NULL,
        is_duplicate INTEGER DEFAULT 0,
        FOREIGN KEY (truck_id) REFERENCES trucks (truck_id),
        FOREIGN KEY (driver_id) REFERENCES drivers (driver_id)
    )
    """)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS financial_records (
        record_id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER,
        truck_id TEXT NOT NULL,
        driver_id TEXT,
        record_type TEXT NOT NULL, -- 'Revenue', 'Maintenance', 'Fuel'
        date TEXT NOT NULL,
        amount REAL NOT NULL,
        details TEXT,
        FOREIGN KEY (document_id) REFERENCES documents (document_id),
        FOREIGN KEY (truck_id) REFERENCES trucks (truck_id),
        FOREIGN KEY (driver_id) REFERENCES drivers (driver_id)
    )
    """)
    
    # 2. Seed Data if database was just created
    cursor.execute("SELECT COUNT(*) FROM trucks")
    if cursor.fetchone()[0] == 0:
        # Seed Trucks
        trucks_data = [
            ("84", "Volvo", "VNL 860", 2022, "TX-TRK-84", "Active"),
            ("102", "Freightliner", "Cascadia", 2023, "TX-TRK-102", "Active"),
            ("150", "Peterbilt", "579", 2021, "TX-TRK-150", "In Shop"),
            ("66", "Kenworth", "T680", 2020, "TX-TRK-66", "Active")
        ]
        cursor.executemany("INSERT INTO trucks VALUES (?, ?, ?, ?, ?, ?)", trucks_data)
        
        # Seed Drivers
        drivers_data = [
            ("D1", "Bob Miller", "DL-998822", "Active"),
            ("D2", "John Smith", "DL-112233", "Active"),
            ("D3", "Alice Jones", "DL-445566", "Active")
        ]
        cursor.executemany("INSERT INTO drivers VALUES (?, ?, ?, ?)", drivers_data)
        
        # Seed Documents & Financial Records (with realistic messiness)
        # We define a helper array of documents to insert
        seeded_docs = [
            # 1. Maintenance Receipt (Truck 84) - Scanned OCR Style
            {
                "file_name": "maint_84_parts.txt",
                "document_type": "Maintenance Receipt",
                "upload_date": "2026-05-13",
                "truck_id": "84",
                "driver_id": "D1",
                "trailer_id": "TL-10",
                "vendor": "Dalas Speed Repir",
                "amount": 1000.0,
                "date": "2026-05-12",
                "expiry_date": None,
                "is_duplicate": 0,
                "raw_text": """
Dalas Speed Repir & Servce Station
5600 Highway 183, Dallas TX
INVOICE #DSR-4491
Date: 2026-05-12
Customer: Supriya Trucking
Unit/Trck: 84
Driver: Bob Miller
Trailer ID: TL-10

Description of Work:
- Replac brake pads on rear axle (Parts: $600.00, Labor: $100.00)
- Oil change and fuel filter renewal (Parts: $250.00, Labor: $50.00)

Total Parts: $850.00
Total Labor: $150.00
-----------------------------
TOTAL COST: $1000.00
Payment Method: Net 30
                """
            },
            # 2. Duplicate Maintenance Receipt (Truck 84)
            {
                "file_name": "maint_84_parts_v2.txt",
                "document_type": "Maintenance Receipt",
                "upload_date": "2026-05-14",
                "truck_id": "84",
                "driver_id": "D1",
                "trailer_id": "TL-10",
                "vendor": "Dalas Speed Repir",
                "amount": 1000.0,
                "date": "2026-05-12",
                "expiry_date": None,
                "is_duplicate": 1,
                "raw_text": """
Dalas Speed Repir & Servce Station
5600 Highway 183, Dallas TX
INVOICE #DSR-4491
Date: 2026-05-12
Customer: Supriya Trucking
Unit/Trck: 84
Driver: Bob Miller
Trailer ID: TL-10

Description of Work:
- Replac brake pads on rear axle (Parts: $600.00, Labor: $100.00)
- Oil change and fuel filter renewal (Parts: $250.00, Labor: $50.00)

Total Parts: $850.00
Total Labor: $150.00
-----------------------------
TOTAL COST: $1000.00
Payment Method: Net 30
                """
            },
            # 3. Registration Renewal (Truck 84)
            {
                "file_name": "reg_renewal_t84.txt",
                "document_type": "Registration",
                "upload_date": "2026-06-01",
                "truck_id": "84",
                "driver_id": None,
                "trailer_id": None,
                "vendor": "Texas DMV",
                "amount": 320.0,
                "date": "2026-06-01",
                "expiry_date": "2027-06-01",
                "is_duplicate": 0,
                "raw_text": """
State of Texas
Commercial Vehicle Registration Renewal Receipt
Receipt Number: TX-REG-99221
Issue Date: 2026-06-01
Expiration Date: 2027-06-01

Vehicle Information:
Unit Number: Truck 84
VIN: 4V4NC9EJ3NN9982
License Plate: TX-TRK-84
Gross Weight: 80,000 lbs

Registration Fee: $320.00
Status: ACTIVE / RENEWED
                """
            },
            # 4. Title Document (Truck 84)
            {
                "file_name": "title_vnl84.txt",
                "document_type": "Title",
                "upload_date": "2026-05-01",
                "truck_id": "84",
                "driver_id": None,
                "trailer_id": None,
                "vendor": "State of Texas",
                "amount": None,
                "date": "2022-04-10",
                "expiry_date": None,
                "is_duplicate": 0,
                "raw_text": """
Texas Certificate of Title
Document Number: TITLE-VOLVO-84
Issue Date: 2022-04-10

Owner Information:
Owner Name: Supriya Trucking Services LLC
Address: 1200 Logistics Way, Irving TX 75038

Vehicle Details:
Year: 2022
Make: Volvo
Model: VNL 860
VIN: 4V4NC9EJ3NN9982
Previous Title Number: TX-OLD-33299
Lienholder: None
                """
            },
            # 5. Fuel Receipt (Truck 84, Driver Bob)
            {
                "file_name": "fuel_slip_bob_84.txt",
                "document_type": "Fuel Record",
                "upload_date": "2026-06-11",
                "truck_id": "84",
                "driver_id": "D1",
                "trailer_id": None,
                "vendor": "Pilot Travel Center",
                "amount": 420.0,
                "date": "2026-06-10",
                "expiry_date": None,
                "is_duplicate": 0,
                "raw_text": """
Pilot Travel Center #412
I-35 Exit 82, Denton TX
Date: 2026-06-10 14:22:10
Sale #: SL-992011
Driver ID: D1 (Bob Miller)
Truck ID: 84
Fuel Type: Diesel #2

Product: Diesel
Quantity: 120.00 Gallons
Price per Gallon: $3.500
Total Fuel Amount: $420.00
Tax Paid: $38.40
Payment Card: FleetOne ****5678
                """
            },
            # 6. Fuel Receipt (Truck 102, Driver John)
            {
                "file_name": "fuel_slip_john_102.txt",
                "document_type": "Fuel Record",
                "upload_date": "2026-06-12",
                "truck_id": "102",
                "driver_id": "D2",
                "trailer_id": None,
                "vendor": "Loves Travel Stop",
                "amount": 360.0,
                "date": "2026-06-11",
                "expiry_date": None,
                "is_duplicate": 0,
                "raw_text": """
Loves Travel Stop #718
Irving TX 75063
Date: 2026-06-11 09:15:00
Driver: John Smith (D2)
Unit: 102

Gallons: 100.00 G
Price/Gal: $3.60
Total Cost: $360.00
Paid via FleetCard.
Thank you for your business!
                """
            },
            # 7. Maintenance Invoice (Truck 102)
            {
                "file_name": "maint_102_tire.txt",
                "document_type": "Maintenance Receipt",
                "upload_date": "2026-05-16",
                "truck_id": "102",
                "driver_id": "D2",
                "trailer_id": None,
                "vendor": "Texas Tire Shop",
                "amount": 450.0,
                "date": "2026-05-15",
                "expiry_date": None,
                "is_duplicate": 0,
                "raw_text": """
Texas Tire Shop & Roadside Service
220 Airport Freeway, Irving TX
Invoice #: TTS-9882
Date: 2026-05-15
Customer: Supriya Trucking
Truck ID: 102

Services Performed:
- Replacement of steer tire (front right)
- Balance and alignment check
Parts (Tire): $350.00
Labor: $100.00
-----------------------------
Total Amount Due: $450.00
Paid in full. Card ending in 4321.
                """
            },
            # 8. Revenue Invoice (Truck 84, Driver Bob)
            {
                "file_name": "inv_998_rev.txt",
                "document_type": "Revenue",
                "upload_date": "2026-06-15",
                "truck_id": "84",
                "driver_id": "D1",
                "trailer_id": "TL-10",
                "vendor": "Global Logistics",
                "amount": 3200.0,
                "date": "2026-06-15",
                "expiry_date": None,
                "is_duplicate": 0,
                "raw_text": """
Freight Invoice #998
Supriya Trucking Services LLC
Bill To: Global Logistics Inc.
PO Box 920, Chicago IL

Load Details:
Carrier Ref: 998
Date: 2026-06-15
Origin: Dallas TX
Destination: Chicago IL
Truck Assigned: 84
Driver Assigned: Bob Miller (D1)
Trailer: TL-10

Total Freight Charges: $3200.00
Due on receipt.
                """
            },
            # 9. Revenue Invoice (Truck 102, Driver John)
            {
                "file_name": "inv_999_rev.txt",
                "document_type": "Revenue",
                "upload_date": "2026-06-14",
                "truck_id": "102",
                "driver_id": "D2",
                "trailer_id": "TL-12",
                "vendor": "Retail Transport",
                "amount": 2800.0,
                "date": "2026-06-14",
                "expiry_date": None,
                "is_duplicate": 0,
                "raw_text": """
Freight Invoice #999
Supriya Trucking Services LLC
Bill To: Retail Transport Corp.

Load Details:
Invoice Date: 2026-06-14
Truck Number: 102
Driver: John Smith (D2)
Trailer: TL-12
Route: Dallas TX to Atlanta GA

Gross Freight Pay: $2800.00
Net 15 Days.
                """
            },
            # 10. Email Fuel Receipt (Truck 150, Driver Alice) - Messy Email Format
            {
                "file_name": "email_fuel_150.txt",
                "document_type": "Fuel Record",
                "upload_date": "2026-06-17",
                "truck_id": "150",
                "driver_id": "D3",
                "trailer_id": None,
                "vendor": "Shell",
                "amount": 380.0,
                "date": "2026-06-16",
                "expiry_date": None,
                "is_duplicate": 0,
                "raw_text": """
From: Alice Jones <alice.jones@supriyatrucking.com>
Sent: Wednesday, June 17, 2026 8:02 AM
To: dispatch@supriyatrucking.com
Subject: fuel slip from yesterday

Hey Boss,
Here is the fuel receipt details from my route yesterday.
I filled up truck 150 at the Shell station in Dallas.
Total cost was $380.00.
I bought 105.5 gallons of diesel.
The pump price was $3.60 per gallon.
Let me know if you need anything else!
Thanks,
Alice
                """
            },
            # 11. Missing Truck Number Receipt (Inferred Truck 102 via John Smith)
            {
                "file_name": "receipt_no_truck_id.txt",
                "document_type": "Maintenance Receipt",
                "upload_date": "2026-06-03",
                "truck_id": "102", # Inferred from Driver John Smith who is assigned to 102
                "driver_id": "D2",
                "trailer_id": None,
                "vendor": "Dallas Parts Supply",
                "amount": 320.0,
                "date": "2026-06-02",
                "expiry_date": None,
                "is_duplicate": 0,
                "raw_text": """
Dallas Parts Supply Shop
1024 Elm St, Dallas TX
TICKET #: DPS-99120
Date: 2026-06-02

Customer Account: Supriya Trucking
Purchased By: John Smith
Contact: John.Smith@supriyatrucking.com

Items Purchased:
1x Remanufactured Alternator (Part #ALT-Fre-102): $280.00
1x Heavy Duty Serpentine Belt: $40.00

Sales Tax: $0.00 (Tax Exempt Certificate on file)
-----------------------------
TOTAL PAID: $320.00
Payment: Cash
                """
            },
            # 12. Tax Form (IFTA Q1 2026)
            {
                "file_name": "ifta_q1_2026.txt",
                "document_type": "IFTA Tax",
                "upload_date": "2026-04-15",
                "truck_id": None,
                "driver_id": None,
                "trailer_id": None,
                "vendor": "IRS / Texas Comptroller",
                "amount": 1250.0,
                "date": "2026-04-15",
                "expiry_date": None,
                "is_duplicate": 0,
                "raw_text": """
Form IFTA-101
International Fuel Tax Agreement (IFTA) Q1 2026 Tax Return
Filing Date: 2026-04-15
Carrier Name: Supriya Trucking Services LLC
Taxpayer ID: XX-XXXX982

Quarter Summary:
Total Fleet Miles: 24,000 miles
Total Taxable Miles: 24,000 miles
Total Gallons Consumed: 3,428 Gal

IFTA Tax Due:
- Texas: $850.00
- Oklahoma: $250.00
- Arkansas: $150.00
Total Tax Due: $1,250.00
Paid via ACH Transfer.
                """
            },
            # 13. Registration Renewal (Truck 150) - EXPIRING SOON Receipt
            {
                "file_name": "reg_renewal_t150.txt",
                "document_type": "Registration",
                "upload_date": "2025-07-01",
                "truck_id": "150",
                "driver_id": None,
                "trailer_id": None,
                "vendor": "Texas DMV",
                "amount": 320.0,
                "date": "2025-07-01",
                "expiry_date": "2026-07-01", # Expiring in 2 weeks (relative to current date June 18, 2026)
                "is_duplicate": 0,
                "raw_text": """
State of Texas
Commercial Vehicle Registration Renewal Receipt
Receipt Number: TX-REG-88220
Issue Date: 2025-07-01
Expiration Date: 2026-07-01

Vehicle Information:
Unit Number: Truck 150
VIN: 5P3NC9EJ2NN4412
License Plate: TX-TRK-150
Gross Weight: 80,000 lbs

Registration Fee: $320.00
Status: ACTIVE (Expiring soon)
                """
            },
            # 14. Maintenance Receipt (Truck 150) - Large Engine repair
            {
                "file_name": "maint_150_engine.txt",
                "document_type": "Maintenance Receipt",
                "upload_date": "2026-06-15",
                "truck_id": "150",
                "driver_id": "D3",
                "trailer_id": None,
                "vendor": "Irving Truck Center",
                "amount": 1200.0,
                "date": "2026-06-14",
                "expiry_date": None,
                "is_duplicate": 0,
                "raw_text": """
Irving Truck Center LLC
1200 Loop 12, Irving TX
Invoice #: ITC-10299
Date: 2026-06-14
Customer: Supriya Trucking
Truck Unit: 150

Services:
Diagnostic run for engine check light. Found issues with exhaust gas recirculation (EGR) valve.
- EGR valve replacement (Parts: $900.00)
- Labor hours (3.0 hours @ $100/hr: $300.00)

Parts Total: $900.00
Labor Total: $300.00
-----------------------------
Invoice Total: $1200.00
Net 30.
                """
            },
            # 15. More Revenue Invoice (Truck 84)
            {
                "file_name": "inv_1002_rev.txt",
                "document_type": "Revenue",
                "upload_date": "2026-06-17",
                "truck_id": "84",
                "driver_id": "D1",
                "trailer_id": "TL-10",
                "vendor": "Global Logistics",
                "amount": 4500.0,
                "date": "2026-06-17",
                "expiry_date": None,
                "is_duplicate": 0,
                "raw_text": """
Freight Invoice #1002
Supriya Trucking Services LLC
Bill To: Global Logistics Inc.

Load Details:
Ref: 1002
Date: 2026-06-17
Route: Chicago IL to Dallas TX
Truck: 84
Driver: Bob Miller (D1)
Trailer: TL-10

Freight Rate: $4500.00
Status: Pending Payment
                """
            }
        ]
        
        # Insert documents
        for doc in seeded_docs:
            cursor.execute("""
            INSERT INTO documents (
                file_name, document_type, upload_date, truck_id, driver_id, trailer_id, 
                vendor, amount, date, expiry_date, raw_text, is_duplicate
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                doc["file_name"], doc["document_type"], doc["upload_date"], doc["truck_id"], doc["driver_id"], doc["trailer_id"],
                doc["vendor"], doc["amount"], doc["date"], doc["expiry_date"], doc["raw_text"], doc["is_duplicate"]
            ))
            doc_id = cursor.lastrowid
            
            # Map Document to Financial Record if applicable
            # (Exclude duplicates to prevent skewing analytics, representing duplicate receipt management)
            if doc["amount"] is not None and doc["document_type"] in ["Maintenance Receipt", "Fuel Record", "Revenue"] and doc["is_duplicate"] == 0:
                record_type = doc["document_type"]
                # Map "Maintenance Receipt" document type to "Maintenance" financial record type
                if record_type == "Maintenance Receipt":
                    record_type = "Maintenance"
                elif record_type == "Fuel Record":
                    record_type = "Fuel"
                    
                cursor.execute("""
                INSERT INTO financial_records (document_id, truck_id, driver_id, record_type, date, amount, details)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    doc_id, doc["truck_id"], doc["driver_id"], record_type, doc["date"], doc["amount"], f"Vendor: {doc['vendor']}"
                ))
                
        conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db(force=True)
    print("Database initialized successfully at:", DB_PATH)
