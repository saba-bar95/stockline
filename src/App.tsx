import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ExpensesPage } from './pages/ExpensesPage'
import { HrPage } from './pages/HrPage'
import { IngredientsPage } from './pages/IngredientsPage'
import { PlPage } from './pages/PlPage'
import { ProductionPage } from './pages/ProductionPage'
import { ProductsPage } from './pages/ProductsPage'
import { PurchasesPage } from './pages/PurchasesPage'
import { RecipesPage } from './pages/RecipesPage'
import { ResalePage } from './pages/ResalePage'
import { SalesPage } from './pages/SalesPage'
import { WriteOffsPage } from './pages/WriteOffsPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<PlPage />} />
          <Route path="ingredients" element={<IngredientsPage />} />
          <Route path="resale" element={<ResalePage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="recipes" element={<RecipesPage />} />
          <Route path="purchases" element={<PurchasesPage />} />
          <Route path="production" element={<ProductionPage />} />
          <Route path="sales" element={<SalesPage />} />
          <Route path="write-offs" element={<WriteOffsPage />} />
          <Route path="hr" element={<HrPage />} />
          <Route path="expenses" element={<ExpensesPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
