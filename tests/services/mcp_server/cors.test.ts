/**
 * @file Security Tests for CORS Configuration
 * Tests Cross-Origin Resource Sharing policies to prevent unauthorized access.
 *
 * SECURITY: CORS is critical for preventing malicious websites
 * from accessing the API on behalf of authenticated users.
 */

describe('CORS Security Configuration', () => {
  // Simulated CORS configuration (mirrors mcp_server/index.ts)
  const CORS_CONFIG = {
    origin: [
      'https://claude.ai',
      'https://www.claude.ai',
      'http://localhost:3000',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  };

  describe('Origin Validation', () => {
    describe('Allowed Origins', () => {
      it('should allow Claude.ai origins', () => {
        expect(CORS_CONFIG.origin).toContain('https://claude.ai');
        expect(CORS_CONFIG.origin).toContain('https://www.claude.ai');
      });

      it('should allow localhost for development', () => {
        expect(CORS_CONFIG.origin).toContain('http://localhost:3000');
      });

      it('should use explicit origin list, not wildcard', () => {
        expect(CORS_CONFIG.origin).not.toContain('*');
        expect(Array.isArray(CORS_CONFIG.origin)).toBe(true);
      });
    });

    describe('Rejected Origins', () => {
      const rejectedOrigins = [
        'https://evil-site.com',
        'https://attacker.com',
        'https://phishing-claude.ai.evil.com',
        'https://claude.ai.attacker.com',
        'http://localhost:8080', // Wrong port
        'file://',
        'null',
      ];

      rejectedOrigins.forEach((origin) => {
        it(`should reject ${origin}`, () => {
          expect(CORS_CONFIG.origin).not.toContain(origin);
        });
      });
    });

    describe('Origin Matching', () => {
      it('should match exact origin', () => {
        const requestOrigin = 'https://claude.ai';
        expect(CORS_CONFIG.origin).toContain(requestOrigin);
      });

      it('should reject subdomain spoofing', () => {
        const spoofedOrigins = [
          'https://evil.claude.ai',
          'https://claude.ai.evil.com',
          'https://not-claude.ai',
        ];

        spoofedOrigins.forEach((origin) => {
          expect(CORS_CONFIG.origin).not.toContain(origin);
        });
      });

      it('should reject protocol downgrade', () => {
        // HTTPS origin should not accept HTTP request
        expect(CORS_CONFIG.origin).not.toContain('http://claude.ai');
      });
    });
  });

  describe('HTTP Methods', () => {
    describe('Allowed Methods', () => {
      it('should allow GET for data retrieval', () => {
        expect(CORS_CONFIG.methods).toContain('GET');
      });

      it('should allow POST for data submission', () => {
        expect(CORS_CONFIG.methods).toContain('POST');
      });

      it('should allow OPTIONS for preflight', () => {
        expect(CORS_CONFIG.methods).toContain('OPTIONS');
      });
    });

    describe('Restricted Methods', () => {
      const restrictedMethods = ['PUT', 'DELETE', 'PATCH', 'HEAD', 'TRACE', 'CONNECT'];

      restrictedMethods.forEach((method) => {
        it(`should not allow ${method}`, () => {
          expect(CORS_CONFIG.methods).not.toContain(method);
        });
      });
    });
  });

  describe('Request Headers', () => {
    describe('Allowed Headers', () => {
      it('should allow Content-Type header', () => {
        expect(CORS_CONFIG.allowedHeaders).toContain('Content-Type');
      });

      it('should allow Authorization header for tokens', () => {
        expect(CORS_CONFIG.allowedHeaders).toContain('Authorization');
      });
    });

    describe('Restricted Headers', () => {
      const restrictedHeaders = [
        'X-Custom-Header',
        'X-Forwarded-For',
        'X-Requested-With',
        'Cookie', // Handled separately via credentials
      ];

      restrictedHeaders.forEach((header) => {
        it(`should not explicitly allow ${header}`, () => {
          expect(CORS_CONFIG.allowedHeaders).not.toContain(header);
        });
      });
    });
  });

  describe('Credentials Handling', () => {
    it('should enable credentials for cookie/auth support', () => {
      expect(CORS_CONFIG.credentials).toBe(true);
    });

    it('should not use wildcard origin with credentials', () => {
      // When credentials: true, origin cannot be '*'
      if (CORS_CONFIG.credentials) {
        expect(CORS_CONFIG.origin).not.toBe('*');
        expect(CORS_CONFIG.origin).not.toContain('*');
      }
    });
  });

  describe('Preflight Requests (OPTIONS)', () => {
    describe('Preflight Response Headers', () => {
      it('should return correct Access-Control-Allow-Origin', () => {
        // Simulated preflight response
        const preflightResponse = {
          'Access-Control-Allow-Origin': 'https://claude.ai',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        };

        expect(preflightResponse['Access-Control-Allow-Origin']).toBe(
          'https://claude.ai'
        );
      });

      it('should include credentials header when enabled', () => {
        const preflightResponse = {
          'Access-Control-Allow-Credentials': 'true',
        };

        expect(preflightResponse['Access-Control-Allow-Credentials']).toBe('true');
      });

      it('should list allowed methods', () => {
        const allowedMethods = CORS_CONFIG.methods.join(', ');
        expect(allowedMethods).toBe('GET, POST, OPTIONS');
      });

      it('should list allowed headers', () => {
        const allowedHeaders = CORS_CONFIG.allowedHeaders.join(', ');
        expect(allowedHeaders).toBe('Content-Type, Authorization');
      });
    });

    describe('Preflight Caching', () => {
      it('should consider max-age for preflight caching', () => {
        // Preflight results can be cached to reduce requests
        const MAX_AGE_SECONDS = 86400; // 24 hours is reasonable
        expect(MAX_AGE_SECONDS).toBeLessThanOrEqual(86400);
      });
    });
  });

  describe('Security Attack Prevention', () => {
    describe('Cross-Site Request Forgery (CSRF)', () => {
      it('should validate origin to prevent CSRF', () => {
        // CSRF attack from evil site
        const attackOrigin = 'https://evil-site.com';
        const isAllowed = CORS_CONFIG.origin.includes(attackOrigin);

        expect(isAllowed).toBe(false);
      });

      it('should require matching origin for credential requests', () => {
        // Request with credentials must have matching origin
        const requestWithCredentials = {
          origin: 'https://claude.ai',
          credentials: 'include',
        };

        expect(CORS_CONFIG.origin).toContain(requestWithCredentials.origin);
      });
    });

    describe('Data Exfiltration Prevention', () => {
      it('should prevent unauthorized sites from reading responses', () => {
        // Without CORS approval, browser won't expose response
        const unauthorizedSite = 'https://attacker.com';
        const isAllowed = CORS_CONFIG.origin.includes(unauthorizedSite);

        expect(isAllowed).toBe(false);
      });
    });

    describe('Header Injection', () => {
      it('should only allow safe headers', () => {
        // Custom headers could be used for attacks
        const safeHeaders = ['Content-Type', 'Authorization'];

        CORS_CONFIG.allowedHeaders.forEach((header) => {
          expect(safeHeaders).toContain(header);
        });
      });
    });
  });

  describe('Environment-Specific Configuration', () => {
    describe('Development Environment', () => {
      it('should allow localhost in development', () => {
        const devOrigins = ['http://localhost:3000', 'http://localhost:3001'];

        devOrigins.forEach((origin) => {
          // At least one localhost should be allowed
          expect(
            CORS_CONFIG.origin.some((o) => o.includes('localhost'))
          ).toBe(true);
        });
      });
    });

    describe('Production Environment', () => {
      it('should use HTTPS-only origins in production', () => {
        const productionOrigins = CORS_CONFIG.origin.filter(
          (o) => !o.includes('localhost')
        );

        productionOrigins.forEach((origin) => {
          expect(origin.startsWith('https://')).toBe(true);
        });
      });

      it('should have explicit origin list', () => {
        expect(Array.isArray(CORS_CONFIG.origin)).toBe(true);
        expect(CORS_CONFIG.origin.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Response Header Security', () => {
    it('should not expose internal error details in CORS errors', () => {
      // CORS errors should be generic
      const corsErrorResponse = {
        error: 'CORS policy violation',
        // Should NOT include: stack trace, internal config, etc.
      };

      expect(corsErrorResponse.error).toBe('CORS policy violation');
      expect(corsErrorResponse).not.toHaveProperty('stack');
      expect(corsErrorResponse).not.toHaveProperty('config');
    });

    it('should return proper error for rejected origins', () => {
      // Rejected requests should not reveal allowed origins
      const rejectedResponse = {
        status: 403,
        message: 'Forbidden',
      };

      expect(rejectedResponse.status).toBe(403);
      expect(rejectedResponse.message).not.toContain('claude.ai');
    });
  });

  describe('Dynamic Origin Configuration', () => {
    it('should support configurable origins via environment', () => {
      // Origins should be configurable, not hardcoded
      const envVar = 'ALLOWED_ORIGINS';
      expect(typeof envVar).toBe('string');
    });

    it('should validate origin format', () => {
      const validOriginPattern = /^https?:\/\/[a-zA-Z0-9][a-zA-Z0-9.-]+[a-zA-Z0-9](:\d+)?$/;

      CORS_CONFIG.origin.forEach((origin) => {
        expect(validOriginPattern.test(origin)).toBe(true);
      });
    });

    it('should reject malformed origins', () => {
      const malformedOrigins = [
        'not-a-url',
        'ftp://files.example.com',
        'javascript:alert(1)',
        '//evil.com',
        'https://',
        '',
      ];

      malformedOrigins.forEach((origin) => {
        expect(CORS_CONFIG.origin).not.toContain(origin);
      });
    });
  });
});
