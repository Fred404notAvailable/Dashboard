-- FAC PYROS — Seed Data for Development/Demo
-- Realistic sample data matching the actual sheet structure

-- Default admin user (password: admin123)
INSERT INTO users (email, password_hash, role, display_name) VALUES
  ('admin@facpyros.in', '$2b$10$qvq/oakXQyjzUpOJqPNz0uphYT7UP7SDDlrbQ26B1s/IxwXMIU8mm', 'admin', 'FAC Admin'),
  ('analyst@facpyros.in', '$2b$10$qvq/oakXQyjzUpOJqPNz0uphYT7UP7SDDlrbQ26B1s/IxwXMIU8mm', 'analyst', 'FAC Analyst'),
  ('viewer@facpyros.in', '$2b$10$qvq/oakXQyjzUpOJqPNz0uphYT7UP7SDDlrbQ26B1s/IxwXMIU8mm', 'viewer', 'FAC Viewer')
ON CONFLICT (email) DO NOTHING;

-- App settings
INSERT INTO app_settings (key, value) VALUES
  ('registration_goal', '500'),
  ('report_title', 'FAC PYROS - Registration Report'),
  ('report_subtitle', 'That''s How We Rock It!')
ON CONFLICT (key) DO NOTHING;

-- Sample registrations (₹200 tier)
INSERT INTO registrations (s_no, registrant_name, reg_no, year, department, school, mobile_no, event_1, event_2, event_3, payment_method, registration_type, registration_date, source_row_hash) VALUES
  (1, 'Rahul Kumar', 'REG2026001', '2nd', 'CSE', 'School of Engineering', '9876543210', 'Quiz', 'Coding', NULL, 'UPI', 200, '2026-08-18', 'h200_1'),
  (2, 'Priya Sharma', 'REG2026002', '1st', 'ECE', 'School of Engineering', '9876543211', 'Dance', 'Singing', 'Quiz', 'Cash', 200, '2026-08-18', 'h200_2'),
  (3, 'Arun Krishnan', 'REG2026003', '3rd', 'MECH', 'School of Engineering', '9876543212', 'Coding', NULL, NULL, 'Card', 200, '2026-08-18', 'h200_3'),
  (4, 'Deepa Menon', 'REG2026004', '2nd', 'EEE', 'School of Engineering', '9876543213', 'Quiz', 'Dance', 'Drama', 'UPI', 200, '2026-08-19', 'h200_4'),
  (5, 'Karthik Rajan', 'REG2026005', '1st', 'CSE', 'School of Engineering', '9876543214', 'Quiz', 'Coding', 'Dance', 'Cash', 200, '2026-08-19', 'h200_5'),
  (6, 'Sneha Patel', 'REG2026006', '4th', 'CIVIL', 'School of Engineering', '9876543215', 'Art', 'Drama', NULL, 'UPI', 200, '2026-08-19', 'h200_6'),
  (7, 'Vijay Anand', 'REG2026007', '2nd', 'ECE', 'School of Science', '9876543216', 'Coding', 'Quiz', NULL, 'Cash', 200, '2026-08-20', 'h200_7'),
  (8, 'Lakshmi Nair', 'REG2026008', '1st', 'CSE', 'School of Engineering', '9876543217', 'Dance', 'Singing', NULL, 'Bank Transfer', 200, '2026-08-20', 'h200_8'),
  (9, 'Suresh Babu', 'REG2026009', '3rd', 'MECH', 'School of Engineering', '9876543218', 'Quiz', 'Coding', 'Art', 'UPI', 200, '2026-08-20', 'h200_9'),
  (10, 'Anitha Raj', 'REG2026010', '2nd', 'CSE', 'School of Engineering', '9876543219', 'Singing', 'Dance', NULL, 'Cash', 200, '2026-08-21', 'h200_10'),
  (11, 'Mohan Das', 'REG2026011', '1st', 'ECE', 'School of Engineering', '9876543220', 'Quiz', NULL, NULL, 'UPI', 200, '2026-08-21', 'h200_11'),
  (12, 'Revathi S', 'REG2026012', '4th', 'EEE', 'School of Engineering', '9876543221', 'Drama', 'Art', NULL, 'Card', 200, '2026-08-21', 'h200_12'),
  (13, 'Ganesh K', 'REG2026013', '2nd', 'CIVIL', 'School of Engineering', '9876543222', 'Coding', 'Quiz', 'Dance', 'Cash', 200, '2026-08-22', 'h200_13'),
  (14, 'Divya R', 'REG2026014', '1st', 'CSE', 'School of Engineering', '9876543223', 'Dance', 'Singing', 'Drama', 'UPI', 200, '2026-08-22', 'h200_14'),
  (15, 'Prasad M', 'REG2026015', '3rd', 'MECH', 'School of Engineering', '9876543224', 'Quiz', 'Art', NULL, 'Bank Transfer', 200, '2026-08-22', 'h200_15'),
  (16, 'Meera V', 'REG2026016', '2nd', 'ECE', 'School of Science', '9876543225', 'Singing', 'Quiz', NULL, 'Cash', 200, '2026-08-23', 'h200_16'),
  (17, 'Ravi Shankar', 'REG2026017', '1st', 'CSE', 'School of Engineering', '9876543226', 'Coding', 'Dance', 'Quiz', 'UPI', 200, '2026-08-23', 'h200_17'),
  (18, 'Kavitha L', 'REG2026018', '4th', 'EEE', 'School of Engineering', '9876543227', 'Art', 'Drama', 'Singing', 'Card', 200, '2026-08-23', 'h200_18'),
  (19, 'Ashwin P', 'REG2026019', '2nd', 'CSE', 'School of Engineering', '9876543228', 'Quiz', 'Coding', NULL, 'UPI', 200, '2026-08-24', 'h200_19'),
  (20, 'Nithya K', 'REG2026020', '1st', 'MECH', 'School of Engineering', '9876543229', 'Dance', 'Quiz', 'Singing', 'Cash', 200, '2026-08-24', 'h200_20'),
  (21, 'Balaji R', 'REG2026021', '3rd', 'CIVIL', 'School of Engineering', '9876543230', 'Coding', NULL, NULL, 'UPI', 200, '2026-08-24', 'h200_21'),
  (22, 'Saranya M', 'REG2026022', '2nd', 'ECE', 'School of Engineering', '9876543231', 'Drama', 'Art', 'Quiz', 'Cash', 200, '2026-08-25', 'h200_22'),
  (23, 'Vignesh T', 'REG2026023', '1st', 'CSE', 'School of Engineering', '9876543232', 'Quiz', 'Coding', 'Dance', 'Card', 200, '2026-08-25', 'h200_23'),
  (24, 'Harini S', 'REG2026024', '4th', 'EEE', 'School of Engineering', NULL, 'Singing', 'Dance', NULL, 'UPI', 200, '2026-08-25', 'h200_24'),
  (25, 'Tamil Selvan', 'REG2026025', '2nd', 'MECH', 'School of Engineering', '9876543234', 'Quiz', 'Art', NULL, NULL, 200, '2026-08-25', 'h200_25')
ON CONFLICT (source_row_hash) DO NOTHING;

-- Sample registrations (₹250 tier)
INSERT INTO registrations (s_no, registrant_name, reg_no, year, department, school, mobile_no, event_1, event_2, event_3, payment_method, registration_type, registration_date, source_row_hash) VALUES
  (1, 'Aditya Verma', 'REG2026101', '2nd', 'CSE', 'School of Engineering', '9876543240', 'Quiz', 'Coding', 'Dance', 'UPI', 250, '2026-08-18', 'h250_1'),
  (2, 'Janani R', 'REG2026102', '1st', 'ECE', 'School of Engineering', '9876543241', 'Dance', 'Singing', NULL, 'Cash', 250, '2026-08-18', 'h250_2'),
  (3, 'Santhosh Kumar', 'REG2026103', '3rd', 'MECH', 'School of Engineering', '9876543242', 'Coding', 'Quiz', NULL, 'Card', 250, '2026-08-19', 'h250_3'),
  (4, 'Pooja Nair', 'REG2026104', '2nd', 'EEE', 'School of Engineering', '9876543243', 'Art', 'Drama', 'Singing', 'UPI', 250, '2026-08-19', 'h250_4'),
  (5, 'Manoj K', 'REG2026105', '1st', 'CSE', 'School of Engineering', '9876543244', 'Quiz', 'Dance', NULL, 'Cash', 250, '2026-08-20', 'h250_5'),
  (6, 'Swathi P', 'REG2026106', '4th', 'CIVIL', 'School of Engineering', '9876543245', 'Drama', 'Art', 'Quiz', 'Bank Transfer', 250, '2026-08-20', 'h250_6'),
  (7, 'Dinesh V', 'REG2026107', '2nd', 'CSE', 'School of Science', '9876543246', 'Coding', 'Quiz', 'Dance', 'UPI', 250, '2026-08-21', 'h250_7'),
  (8, 'Ramya S', 'REG2026108', '1st', 'ECE', 'School of Engineering', '9876543247', 'Singing', 'Dance', NULL, 'Cash', 250, '2026-08-21', 'h250_8'),
  (9, 'Gopal M', 'REG2026109', '3rd', 'MECH', 'School of Engineering', '9876543248', 'Quiz', 'Art', NULL, 'UPI', 250, '2026-08-22', 'h250_9'),
  (10, 'Bhavana R', 'REG2026110', '2nd', 'EEE', 'School of Engineering', '9876543249', 'Dance', 'Coding', 'Quiz', 'Card', 250, '2026-08-22', 'h250_10'),
  (11, 'Senthil K', 'REG2026111', '1st', 'CSE', 'School of Engineering', '9876543250', 'Quiz', 'Coding', NULL, 'Cash', 250, '2026-08-23', 'h250_11'),
  (12, 'Gayathri V', 'REG2026112', '4th', 'ECE', 'School of Engineering', '9876543251', 'Drama', 'Singing', 'Art', 'UPI', 250, '2026-08-23', 'h250_12'),
  (13, 'Naveen R', 'REG2026113', '2nd', 'CIVIL', 'School of Engineering', '9876543252', 'Coding', 'Dance', NULL, 'Cash', 250, '2026-08-24', 'h250_13'),
  (14, 'Sowmya L', 'REG2026114', '1st', 'CSE', 'School of Engineering', '9876543253', 'Quiz', 'Singing', 'Drama', 'UPI', 250, '2026-08-24', 'h250_14'),
  (15, 'Rajesh B', 'REG2026115', '3rd', 'EEE', 'School of Engineering', '9876543254', 'Art', 'Quiz', NULL, 'Bank Transfer', 250, '2026-08-25', 'h250_15'),
  (16, 'Anusha M', 'REG2026116', '2nd', 'MECH', 'School of Engineering', '9876543255', 'Dance', 'Coding', 'Quiz', 'Cash', 250, '2026-08-25', 'h250_16'),
  (17, 'Venkat S', 'REG2026117', '1st', 'CSE', 'School of Engineering', '9876543256', 'Quiz', 'Dance', NULL, 'UPI', 250, '2026-08-25', 'h250_17'),
  (18, 'Padma K', 'REG2026118', '4th', 'ECE', 'School of Engineering', NULL, 'Singing', 'Drama', NULL, NULL, 250, '2026-08-25', 'h250_18')
ON CONFLICT (source_row_hash) DO NOTHING;
