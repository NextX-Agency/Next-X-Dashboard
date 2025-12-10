-- Purchase Orders table
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  exchange_rate DECIMAL(10, 4),
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  notes TEXT,
  expected_arrival TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Purchase Order Items table
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_cost DECIMAL(10, 2) NOT NULL DEFAULT 0,
  subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
  quantity_received INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_purchase_orders_wallet_id ON purchase_orders(wallet_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_location_id ON purchase_orders(location_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_at ON purchase_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_order_id ON purchase_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_item_id ON purchase_order_items(item_id);

-- Enable RLS
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

-- Create policies for purchase_orders (allow all for authenticated users)
CREATE POLICY "Allow all operations on purchase_orders" ON purchase_orders
  FOR ALL USING (true) WITH CHECK (true);

-- Create policies for purchase_order_items (allow all for authenticated users)
CREATE POLICY "Allow all operations on purchase_order_items" ON purchase_order_items
  FOR ALL USING (true) WITH CHECK (true);

-- Create trigger to update updated_at on purchase_orders
CREATE OR REPLACE FUNCTION update_purchase_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_purchase_orders_updated_at();
