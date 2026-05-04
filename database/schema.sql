CREATE DATABASE IF NOT EXISTS patrol;
USE patrol;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'admin'
);

-- STATIONS TABLE
CREATE TABLE IF NOT EXISTS stations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  address VARCHAR(255),
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  phone VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- OFFICERS TABLE
CREATE TABLE IF NOT EXISTS officers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  badge_number VARCHAR(20) UNIQUE NOT NULL,
  designation ENUM('Constable', 'Head Constable', 'ASI', 'SI', 'Inspector', 'DSP', 'SP') DEFAULT 'Constable',
  phone VARCHAR(20),
  email VARCHAR(100),
  shift ENUM('morning', 'evening', 'night') DEFAULT 'morning',
  status ENUM('available', 'on_duty', 'off_duty', 'leave') DEFAULT 'available',
  station_id INT,
  profile_image VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE SET NULL
);

-- HOTSPOTS (CRIME ZONES) TABLE
CREATE TABLE IF NOT EXISTS hotspots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  zone_name VARCHAR(100) NOT NULL,
  description TEXT,
  lat DECIMAL(10, 8) NOT NULL,
  lng DECIMAL(11, 8) NOT NULL,
  radius_meters INT DEFAULT 500,
  risk_score INT DEFAULT 50 CHECK (risk_score BETWEEN 0 AND 100),
  risk_level ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') DEFAULT 'MEDIUM',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- CRIMES TABLE
CREATE TABLE IF NOT EXISTS crimes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  crime_type ENUM(
    'Theft', 'Robbery', 'Assault', 'Burglary', 'Vandalism',
    'Drug Offense', 'Fraud', 'Murder', 'Kidnapping', 'Eve Teasing',
    'Domestic Violence', 'Traffic Violation', 'Other'
  ) NOT NULL,
  description TEXT,
  area_id INT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  severity ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
  status ENUM('open', 'investigating', 'resolved', 'closed') DEFAULT 'open',
  occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reported_by VARCHAR(100),
  fir_number VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (area_id) REFERENCES hotspots(id) ON DELETE SET NULL
);

-- PATROLS TABLE
CREATE TABLE IF NOT EXISTS patrols (
  id INT AUTO_INCREMENT PRIMARY KEY,
  officer_id INT NOT NULL,
  route_data JSON,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  status ENUM('scheduled', 'active', 'completed', 'cancelled') DEFAULT 'scheduled',
  current_lat DECIMAL(10, 8),
  current_lng DECIMAL(11, 8),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (officer_id) REFERENCES officers(id) ON DELETE CASCADE
);

-- PATROL WAYPOINTS TABLE
CREATE TABLE IF NOT EXISTS patrol_waypoints (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patrol_id INT NOT NULL,
  area_id INT,
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  sequence_order INT NOT NULL,
  estimated_arrival TIMESTAMP,
  actual_arrival TIMESTAMP,
  status ENUM('pending', 'reached', 'skipped') DEFAULT 'pending',
  FOREIGN KEY (patrol_id) REFERENCES patrols(id) ON DELETE CASCADE,
  FOREIGN KEY (area_id) REFERENCES hotspots(id) ON DELETE SET NULL
);

-- INCIDENTS TABLE (real-time incidents during patrol)
CREATE TABLE IF NOT EXISTS incidents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patrol_id INT,
  crime_id INT,
  officer_id INT NOT NULL,
  description TEXT NOT NULL,
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  severity ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
  reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patrol_id) REFERENCES patrols(id) ON DELETE SET NULL,
  FOREIGN KEY (officer_id) REFERENCES officers(id) ON DELETE CASCADE
);

-- INDEXES for performance
CREATE INDEX idx_crimes_area ON crimes(area_id);
CREATE INDEX idx_crimes_type ON crimes(crime_type);
CREATE INDEX idx_crimes_occurred ON crimes(occurred_at);
CREATE INDEX idx_crimes_status ON crimes(status);
CREATE INDEX idx_patrols_officer ON patrols(officer_id);
CREATE INDEX idx_patrols_status ON patrols(status);
CREATE INDEX idx_officers_status ON officers(status);
CREATE INDEX idx_officers_shift ON officers(shift);
CREATE INDEX idx_hotspots_risk ON hotspots(risk_score);
