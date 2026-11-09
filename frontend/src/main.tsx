import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/atkinson-hyperlegible-next/400.css'
import '@fontsource/atkinson-hyperlegible-next/600.css'
import '@fontsource/atkinson-hyperlegible-next/700.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
