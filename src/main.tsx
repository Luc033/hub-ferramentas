import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { router } from './app/router'
import { SettingsProvider } from './app/providers/SettingsProvider'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><SettingsProvider><RouterProvider router={router} /></SettingsProvider></React.StrictMode>,
)
