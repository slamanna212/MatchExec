import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { 
  Navbar, 
  NavbarBrand, 
  NavbarContent, 
  NavbarItem, 
  Link,
  Button,
  Card,
  CardBody,
  Spinner 
} from '@heroui/react';

import HomePage from './pages/HomePage';
import GamesPage from './pages/GamesPage';
import GameDetailPage from './pages/GameDetailPage';
import NotFoundPage from './pages/NotFoundPage';

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-blue-900">
      {/* Navigation */}
      <Navbar className="bg-black/20 backdrop-blur-md border-b border-white/10">
        <NavbarBrand>
          <Link href="/" className="text-2xl font-bold text-white">
            MatchExec
          </Link>
        </NavbarBrand>
        
        <NavbarContent className="hidden sm:flex gap-4" justify="center">
          <NavbarItem>
            <Link href="/" className="text-white/80 hover:text-white">
              Home
            </Link>
          </NavbarItem>
          <NavbarItem>
            <Link href="/games" className="text-white/80 hover:text-white">
              Games
            </Link>
          </NavbarItem>
        </NavbarContent>

        <NavbarContent justify="end">
          <NavbarItem>
            <Button 
              color="primary" 
              variant="flat" 
              className="text-white"
            >
              Connect Discord
            </Button>
          </NavbarItem>
        </NavbarContent>
      </Navbar>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/games/:gameId" element={<GameDetailPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="bg-black/30 backdrop-blur-md border-t border-white/10 mt-16">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="text-white/60 text-sm">
              © 2024 MatchExec. Built with Express 5, React 18, and HeroUI.
            </div>
            <div className="flex gap-4 mt-4 md:mt-0">
              <Link href="/api/docs" className="text-white/60 hover:text-white text-sm">
                API Docs
              </Link>
              <Link href="/health" className="text-white/60 hover:text-white text-sm">
                Health
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App; 