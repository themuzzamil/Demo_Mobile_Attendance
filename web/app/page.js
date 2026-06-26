'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredUser, homePathFor } from '@/lib/clientApi';

export default function Index() {
  const router = useRouter();
  useEffect(() => {
    router.replace(homePathFor(getStoredUser()));
  }, [router]);
  return null;
}
