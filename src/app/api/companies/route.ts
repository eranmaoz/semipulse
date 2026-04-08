import { NextResponse } from 'next/server';
import { fetchCompanies } from '@/lib/db';
import { MONITORED_COMPANIES } from '@/lib/mockData';

const isSupabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your_supabase');

export async function GET() {
  if (!isSupabaseConfigured) {
    return NextResponse.json(MONITORED_COMPANIES);
  }

  try {
    const companies = await fetchCompanies();
    return NextResponse.json(companies.length > 0 ? companies : MONITORED_COMPANIES);
  } catch {
    return NextResponse.json(MONITORED_COMPANIES);
  }
}
