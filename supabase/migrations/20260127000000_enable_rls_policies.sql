-- Enable RLS on all public tables
-- This migration enables Row Level Security and creates permissive policies for authenticated users

-- Enable RLS on all tables
ALTER TABLE public.seller_category_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_post_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users (admin access)
-- These allow full access for authenticated users to maintain current functionality

CREATE POLICY "Allow authenticated users" ON public.seller_category_rates FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users" ON public.categories FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users" ON public.exchange_rates FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users" ON public.stock_transfers FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users" ON public.wallets FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users" ON public.expenses FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users" ON public.goals FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users" ON public.budget_categories FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users" ON public.stock FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users" ON public.expense_categories FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users" ON public.budgets FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users" ON public.sellers FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users" ON public.clients FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users" ON public.activity_logs FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users" ON public.items FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users" ON public.users FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users" ON public.store_settings FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users" ON public.reservations FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users" ON public.combo_items FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users" ON public.locations FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users" ON public.sales FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users" ON public.sale_items FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users" ON public.wallet_transactions FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users" ON public.commissions FOR ALL USING (auth.role() = 'authenticated');

-- Public read access for CMS tables (blog, pages, etc.)
-- Blog categories - public read, authenticated write
CREATE POLICY "Public read access" ON public.blog_categories FOR SELECT USING (true);
CREATE POLICY "Authenticated write access" ON public.blog_categories FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update access" ON public.blog_categories FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated delete access" ON public.blog_categories FOR DELETE USING (auth.role() = 'authenticated');

-- Blog posts - public read for published posts, authenticated full access
CREATE POLICY "Public read published posts" ON public.blog_posts FOR SELECT USING (status = 'published' OR auth.role() = 'authenticated');
CREATE POLICY "Authenticated write access" ON public.blog_posts FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update access" ON public.blog_posts FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated delete access" ON public.blog_posts FOR DELETE USING (auth.role() = 'authenticated');

-- Blog tags
CREATE POLICY "Public read access" ON public.blog_tags FOR SELECT USING (true);
CREATE POLICY "Authenticated write access" ON public.blog_tags FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update access" ON public.blog_tags FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated delete access" ON public.blog_tags FOR DELETE USING (auth.role() = 'authenticated');

-- Blog post tags
CREATE POLICY "Public read access" ON public.blog_post_tags FOR SELECT USING (true);
CREATE POLICY "Authenticated write access" ON public.blog_post_tags FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update access" ON public.blog_post_tags FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated delete access" ON public.blog_post_tags FOR DELETE USING (auth.role() = 'authenticated');

-- Pages - public read for published pages
CREATE POLICY "Public read published pages" ON public.pages FOR SELECT USING (is_published = true OR auth.role() = 'authenticated');
CREATE POLICY "Authenticated write access" ON public.pages FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update access" ON public.pages FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated delete access" ON public.pages FOR DELETE USING (auth.role() = 'authenticated');

-- Item images - public read
CREATE POLICY "Public read access" ON public.item_images FOR SELECT USING (true);
CREATE POLICY "Authenticated write access" ON public.item_images FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update access" ON public.item_images FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated delete access" ON public.item_images FOR DELETE USING (auth.role() = 'authenticated');

-- Item features - public read
CREATE POLICY "Public read access" ON public.item_features FOR SELECT USING (true);
CREATE POLICY "Authenticated write access" ON public.item_features FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update access" ON public.item_features FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated delete access" ON public.item_features FOR DELETE USING (auth.role() = 'authenticated');

-- Banners - public read for active banners
CREATE POLICY "Public read active banners" ON public.banners FOR SELECT USING (is_active = true OR auth.role() = 'authenticated');
CREATE POLICY "Authenticated write access" ON public.banners FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update access" ON public.banners FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated delete access" ON public.banners FOR DELETE USING (auth.role() = 'authenticated');

-- Collections - public read
CREATE POLICY "Public read access" ON public.collections FOR SELECT USING (true);
CREATE POLICY "Authenticated write access" ON public.collections FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update access" ON public.collections FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated delete access" ON public.collections FOR DELETE USING (auth.role() = 'authenticated');

-- Collection items - public read
CREATE POLICY "Public read access" ON public.collection_items FOR SELECT USING (true);
CREATE POLICY "Authenticated write access" ON public.collection_items FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update access" ON public.collection_items FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated delete access" ON public.collection_items FOR DELETE USING (auth.role() = 'authenticated');

-- Reviews - public read for approved reviews
CREATE POLICY "Public read approved reviews" ON public.reviews FOR SELECT USING (is_approved = true OR auth.role() = 'authenticated');
CREATE POLICY "Public submit reviews" ON public.reviews FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated update access" ON public.reviews FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated delete access" ON public.reviews FOR DELETE USING (auth.role() = 'authenticated');

-- Subscribers - insert only for public, full access for authenticated
CREATE POLICY "Public subscribe" ON public.subscribers FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated read access" ON public.subscribers FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update access" ON public.subscribers FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated delete access" ON public.subscribers FOR DELETE USING (auth.role() = 'authenticated');

-- Testimonials - public read for active testimonials
CREATE POLICY "Public read active testimonials" ON public.testimonials FOR SELECT USING (is_active = true OR auth.role() = 'authenticated');
CREATE POLICY "Authenticated write access" ON public.testimonials FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update access" ON public.testimonials FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated delete access" ON public.testimonials FOR DELETE USING (auth.role() = 'authenticated');

-- FAQs - public read for active FAQs
CREATE POLICY "Public read active faqs" ON public.faqs FOR SELECT USING (is_active = true OR auth.role() = 'authenticated');
CREATE POLICY "Authenticated write access" ON public.faqs FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update access" ON public.faqs FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated delete access" ON public.faqs FOR DELETE USING (auth.role() = 'authenticated');
