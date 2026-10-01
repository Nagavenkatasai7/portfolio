/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // The old site had a blog, newsletter, and admin studio. Send any old links
  // to the homepage instead of a 404.
  async redirects() {
    const legacy = ['/blog', '/blog/:path*', '/newsletter/:path*', '/admin/:path*', '/index.html'].map((source) => ({
      source,
      destination: '/',
      permanent: false,
    }));
    // Short links to project demos (moved here from vercel.json when the site left Vercel).
    const projects = [
      { source: '/intellidoc', destination: 'https://intellidoc-nexus.vercel.app', permanent: false },
      { source: '/jira-automation', destination: 'https://ai-business-request-intake.vercel.app', permanent: false },
      { source: '/automation-roi', destination: 'https://ai-automation-roi.vercel.app', permanent: false },
      { source: '/healthcare-emr', destination: 'https://healthcare-emr-extraction.vercel.app', permanent: false },
      { source: '/master-data', destination: 'https://product-master-data-qc.vercel.app', permanent: false },
      { source: '/revops', destination: 'https://revops-automation-dashboard.vercel.app', permanent: false },
      { source: '/resume-tailor', destination: 'https://resume-maker-coral-alpha.vercel.app', permanent: false },
      { source: '/passport', destination: 'https://passportpathways.vercel.app', permanent: false },
      { source: '/llm-forge', destination: 'https://github.com/Nagavenkatasai7/llm-forge', permanent: false },
      { source: '/lora-pipeline', destination: 'https://github.com/Nagavenkatasai7/llm-finetuning-lora-pipeline', permanent: false },
      { source: '/adk-agents', destination: 'https://github.com/Nagavenkatasai7/google-adk-multi-agent-workflow', permanent: false },
      { source: '/paper-discovery', destination: 'https://github.com/Nagavenkatasai7/Research-Paper-Discovery-System', permanent: false },
      { source: '/rag-scratch', destination: 'https://github.com/Nagavenkatasai7/rag-from-scratch', permanent: false },
      { source: '/learning-agent', destination: 'https://github.com/Nagavenkatasai7/learning-agent', permanent: false },
      { source: '/vlm-eval', destination: 'https://github.com/Nagavenkatasai7/vlm-eval-immersive-analytics', permanent: false },
    ];
    return [...legacy, ...projects];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
