// The index page "/" serves the catalog - the public storefront
// This is the landing page for all users including guests

import CatalogPage from './catalog/page'

export const dynamic = 'force-dynamic'

export default function HomePage() {
	return <CatalogPage />
}
