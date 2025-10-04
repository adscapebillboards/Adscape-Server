-- Create BMI data table for storing BMI test results
CREATE TABLE IF NOT EXISTS bmi_data (
  id SERIAL PRIMARY KEY,
  device_id VARCHAR(255) NOT NULL,
  height DECIMAL(5,2) NOT NULL,
  weight DECIMAL(5,2) NOT NULL,
  bmi DECIMAL(4,1) NOT NULL,
  category VARCHAR(50) NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bmi_data_device_id ON bmi_data(device_id);
CREATE INDEX IF NOT EXISTS idx_bmi_data_timestamp ON bmi_data(timestamp);
CREATE INDEX IF NOT EXISTS idx_bmi_data_category ON bmi_data(category);

-- Add comments
COMMENT ON TABLE bmi_data IS 'Stores BMI test results from connected devices';
COMMENT ON COLUMN bmi_data.device_id IS 'Unique device identifier';
COMMENT ON COLUMN bmi_data.height IS 'Height in centimeters';
COMMENT ON COLUMN bmi_data.weight IS 'Weight in kilograms';
COMMENT ON COLUMN bmi_data.bmi IS 'Calculated BMI value';
COMMENT ON COLUMN bmi_data.category IS 'BMI category (Underweight, Normal weight, Overweight, Obese)';
COMMENT ON COLUMN bmi_data.timestamp IS 'When the BMI test was performed';
COMMENT ON COLUMN bmi_data.created_at IS 'When the record was created in database';

