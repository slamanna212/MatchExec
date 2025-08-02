'use client'

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
  NavbarMenu,
  NavbarMenuItem,
  NavbarMenuToggle,
  Link as HeroUILink
} from '@heroui/react';
import {
  HomeIcon,
  GamepadIcon,
  SettingsIcon,
  CodeIcon
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
    <Navbar 
      isMenuOpen={isMenuOpen}
      onMenuOpenChange={setIsMenuOpen}
      maxWidth="full"
      position="sticky"
      className="border-b border-divider"
    >
      <NavbarContent>
        <NavbarMenuToggle className="sm:hidden" />
        <NavbarBrand>
          <p className="font-bold text-xl text-primary">MatchExec</p>
        </NavbarBrand>
      </NavbarContent>

      <NavbarContent className="hidden sm:flex gap-4" justify="center">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          
          return (
            <NavbarItem key={item.name} isActive={active}>
              <HeroUILink
                as={Link}
                href={item.href}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors no-underline ${
                  active 
                    ? 'text-primary bg-primary/10' 
                    : 'text-default-600 hover:text-primary hover:bg-default-100'
                }`}
              >
                <Icon size={18} />
                <span className="font-medium">{item.name}</span>
              </HeroUILink>
            </NavbarItem>
          );
        })}
      </NavbarContent>

      <NavbarContent justify="end">
        <NavbarItem className="hidden sm:flex">
          <span className="text-tiny text-default-400">v1.0.0</span>
        </NavbarItem>
      </NavbarContent>

      <NavbarMenu>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          
          return (
            <NavbarMenuItem key={item.name}>
              <HeroUILink
                as={Link}
                href={item.href}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors no-underline ${
                  active 
                    ? 'bg-primary/10 text-primary' 
                    : 'text-default-700 hover:text-default-900 hover:bg-default-100'
                }`}
                onPress={() => setIsMenuOpen(false)}
              >
                <Icon size={20} />
                <span className="font-medium">{item.name}</span>
              </HeroUILink>
            </NavbarMenuItem>
          );
        })}
        
        <NavbarMenuItem>
          <div className="pt-4 border-t border-divider mt-4">
            <div className="text-tiny text-default-400 text-center">
              Version 1.0.0
            </div>
          </div>
        </NavbarMenuItem>
      </NavbarMenu>
    </Navbar>
  );
}