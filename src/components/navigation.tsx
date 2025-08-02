'use client'

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Button,
  Card,
  CardBody,
  Divider
} from '@heroui/react';
import {
  HomeIcon,
  GamepadIcon,
  SettingsIcon,
  CodeIcon,
  MenuIcon
} from 'lucide-react';

const menuItems = [
  { name: 'Matches', href: '/', icon: HomeIcon },
  { name: 'Games', href: '/games', icon: GamepadIcon },
  { name: 'Settings', href: '/settings', icon: SettingsIcon },
  { name: 'Dev', href: '/dev', icon: CodeIcon },
];

export function Navigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:z-50">
        <Card className="h-full rounded-none">
          <CardBody className="flex flex-col p-6">
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-primary">MatchExec</h1>
              <p className="text-small text-default-500">Tournament Manager</p>
            </div>
            
            <nav className="flex-1">
              <ul className="space-y-2">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  
                  return (
                    <li key={item.name}>
                      <Link href={item.href}>
                        <div className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors hover:bg-default-100 ${
                          active 
                            ? 'bg-primary/10 text-primary' 
                            : 'text-default-700 hover:text-default-900'
                        }`}>
                          <Icon size={20} className="flex-shrink-0" />
                          <span className="font-medium">{item.name}</span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            
            <Divider className="my-4" />
            
            <div className="text-tiny text-default-400 text-center">
              Version 1.0.0
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Mobile Navigation */}
      <div className="lg:hidden">
        {/* Top Bar */}
        <div className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-divider">
          <div className="flex items-center justify-between p-4">
            <h1 className="text-xl font-bold text-primary">MatchExec</h1>
            <Button
              isIconOnly
              variant="light"
              onPress={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Toggle menu"
            >
              <MenuIcon size={24} />
            </Button>
          </div>
        </div>

        {/* Mobile Menu Overlay */}
        {isMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div 
              className="fixed inset-0 bg-black/20" 
              onClick={() => setIsMenuOpen(false)}
            />
            <div className="fixed top-0 right-0 bottom-0 w-64 bg-background border-l border-divider">
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between p-4 border-b border-divider">
                  <h1 className="text-xl font-bold text-primary">MatchExec</h1>
                  <Button
                    isIconOnly
                    variant="light"
                    onPress={() => setIsMenuOpen(false)}
                    aria-label="Close menu"
                  >
                    <MenuIcon size={24} />
                  </Button>
                </div>
                
                <nav className="flex-1 p-4">
                  <ul className="space-y-2">
                    {menuItems.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(item.href);
                      
                      return (
                        <li key={item.name}>
                          <Link href={item.href} onClick={() => setIsMenuOpen(false)}>
                            <Button
                              variant={active ? "flat" : "light"}
                              color={active ? "primary" : "default"}
                              className="w-full justify-start"
                              startContent={<Icon size={20} />}
                            >
                              {item.name}
                            </Button>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </nav>
                
                <div className="p-4 border-t border-divider">
                  <div className="text-tiny text-default-400 text-center">
                    Version 1.0.0
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}