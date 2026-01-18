import { describe, it, expect } from 'vitest'
import { scrubText, scrubObject } from './scrubber'

describe('scrubText', () => {
  describe('IBAN patterns', () => {
    it('scrubs German IBAN', () => {
      expect(scrubText('My IBAN is DE89370400440532013000')).toContain('[IBAN]')
    })

    it('scrubs IBAN with spaces', () => {
      expect(scrubText('IBAN: DE89 3704 0044 0532 0130 00')).toContain('[IBAN]')
    })
  })

  describe('Email patterns', () => {
    it('scrubs standard email', () => {
      expect(scrubText('Contact me at user@example.com')).toBe('Contact me at [EMAIL]')
    })

    it('scrubs email with plus sign', () => {
      expect(scrubText('user+tag@example.com')).toBe('[EMAIL]')
    })

    it('scrubs email with subdomain', () => {
      expect(scrubText('user@mail.example.co.uk')).toBe('[EMAIL]')
    })
  })

  describe('Phone patterns', () => {
    it('scrubs international phone with plus', () => {
      expect(scrubText('Call +49 123 456 7890')).toContain('[PHONE]')
    })

    it('scrubs US phone with parentheses', () => {
      expect(scrubText('Phone: (555) 123-4567')).toContain('[PHONE]')
    })

    it('scrubs phone with dashes', () => {
      expect(scrubText('555-123-4567')).toContain('[PHONE]')
    })
  })

  describe('JWT Token patterns', () => {
    it('scrubs JWT token', () => {
      const jwt =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
      expect(scrubText(`Bearer ${jwt}`)).toContain('[TOKEN]')
    })
  })

  describe('Sensitive data patterns', () => {
    it('scrubs API key assignment', () => {
      expect(scrubText('api_key=sk_live_1234567890abcdef')).toContain('[SENSITIVE_DATA]')
    })

    it('scrubs password in config', () => {
      expect(scrubText('password: "verysecretpassword123"')).toContain('[SENSITIVE_DATA]')
    })

    it('scrubs bearer token', () => {
      expect(scrubText('bearer: abcdefghij1234567890abcdef')).toContain('[SENSITIVE_DATA]')
    })
  })

  describe('Credit card patterns', () => {
    it('scrubs Visa card', () => {
      expect(scrubText('Card: 4111111111111111')).toContain('[CREDIT_CARD]')
    })

    it('scrubs Visa card with dashes', () => {
      expect(scrubText('4111-1111-1111-1111')).toContain('[CREDIT_CARD]')
    })

    it('scrubs Visa card with spaces', () => {
      expect(scrubText('4111 1111 1111 1111')).toContain('[CREDIT_CARD]')
    })

    it('scrubs Mastercard', () => {
      expect(scrubText('5500000000000004')).toContain('[CREDIT_CARD]')
    })

    it('scrubs Amex', () => {
      expect(scrubText('371449635398431')).toContain('[CREDIT_CARD]')
    })
  })

  describe('SSN patterns', () => {
    it('scrubs SSN with dashes', () => {
      expect(scrubText('SSN: 123-45-6789')).toContain('[SSN]')
    })

    it('scrubs SSN with spaces', () => {
      expect(scrubText('SSN: 123 45 6789')).toContain('[SSN]')
    })

    it('does not scrub 9-digit numbers without separators (too ambiguous)', () => {
      // Without separators, 9-digit numbers could be anything - zip+4, account numbers, etc.
      // We require dashes or spaces for SSN detection
      const result = scrubText('ID: 123456789')
      expect(result).not.toContain('[SSN]')
    })
  })

  describe('IP address patterns', () => {
    it('scrubs IPv4 address', () => {
      expect(scrubText('Server IP: 192.168.1.100')).toBe('Server IP: [IP_ADDRESS]')
    })

    it('scrubs localhost IPv4', () => {
      expect(scrubText('Connect to 127.0.0.1')).toContain('[IP_ADDRESS]')
    })

    it('scrubs IPv6 address', () => {
      expect(scrubText('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toContain('[IP_ADDRESS]')
    })
  })

  describe('File path patterns', () => {
    it('scrubs Unix home path', () => {
      expect(scrubText('Config at /home/user/config.json')).toContain('[FILE_PATH]')
    })

    it('scrubs macOS Users path', () => {
      expect(scrubText('File: /Users/john/Documents/secret.txt')).toContain('[FILE_PATH]')
    })

    it('scrubs Windows Users path', () => {
      expect(scrubText('Path: C:\\Users\\john\\Documents\\file.txt')).toContain('[FILE_PATH]')
    })

    it('scrubs Windows AppData path', () => {
      expect(scrubText('C:\\Users\\john\\AppData\\Local\\app')).toContain('[FILE_PATH]')
    })

    it('does not scrub safe API paths', () => {
      expect(scrubText('/api/v1/users')).toBe('/api/v1/users')
    })
  })

  describe('ISIN patterns', () => {
    it('hashes valid ISIN', () => {
      const result = scrubText('ETF ISIN: IE00B4L5Y983')
      expect(result).toMatch(/\[ASSET_HASH_[a-f0-9]+\]/)
      expect(result).not.toContain('IE00B4L5Y983')
    })

    it('hashes US ISIN', () => {
      const result = scrubText('US0378331005')
      expect(result).toMatch(/\[ASSET_HASH_[a-f0-9]+\]/)
    })
  })

  describe('ReDoS protection', () => {
    it('handles extremely long input without hanging', () => {
      const start = Date.now()
      const longInput = 'a'.repeat(200000)
      const result = scrubText(longInput)
      const elapsed = Date.now() - start

      expect(elapsed).toBeLessThan(1000) // Should complete in under 1 second
      expect(result).toContain('[TRUNCATED]')
    })

    it('handles pathological email-like input', () => {
      const start = Date.now()
      // This pattern could cause ReDoS in naive implementations
      const pathological = 'a'.repeat(100) + '@' + 'b'.repeat(100)
      scrubText(pathological)
      const elapsed = Date.now() - start

      expect(elapsed).toBeLessThan(100) // Should be very fast
    })
  })

  describe('empty and null handling', () => {
    it('handles empty string', () => {
      expect(scrubText('')).toBe('')
    })

    it('handles null-ish values', () => {
      expect(scrubText(null as unknown as string)).toBe('')
      expect(scrubText(undefined as unknown as string)).toBe('')
    })
  })

  describe('combined patterns', () => {
    it('scrubs multiple PII types in one string', () => {
      const input = 'Contact user@example.com at +1-555-123-4567, SSN 123-45-6789'
      const result = scrubText(input)

      expect(result).toContain('[EMAIL]')
      expect(result).toContain('[PHONE]')
      expect(result).toContain('[SSN]')
      expect(result).not.toContain('user@example.com')
      expect(result).not.toContain('555-123-4567')
      expect(result).not.toContain('123-45-6789')
    })
  })
})

describe('scrubObject', () => {
  it('scrubs PII in nested objects', () => {
    const obj = {
      user: {
        email: 'test@example.com',
        phone: '+1-555-123-4567',
      },
    }
    const result = scrubObject(obj)

    expect(result.user.email).toBe('[EMAIL]')
    expect(result.user.phone).toContain('[PHONE]')
  })

  it('redacts sensitive value keys', () => {
    const obj = {
      portfolio: {
        totalValue: 50000,
        quantity: 100,
        currentPrice: 500,
      },
    }
    const result = scrubObject(obj)

    expect(result.portfolio.totalValue).toBe('[REDACTED_VALUE]')
    expect(result.portfolio.quantity).toBe('[REDACTED_VALUE]')
    expect(result.portfolio.currentPrice).toBe('[REDACTED_VALUE]')
  })

  it('scrubs PII in arrays', () => {
    const obj = {
      emails: ['user1@example.com', 'user2@example.com'],
    }
    const result = scrubObject(obj)

    expect(result.emails[0]).toBe('[EMAIL]')
    expect(result.emails[1]).toBe('[EMAIL]')
  })

  it('preserves non-PII strings', () => {
    const obj = {
      name: 'Portfolio Dashboard',
      status: 'active',
    }
    const result = scrubObject(obj)

    expect(result.name).toBe('Portfolio Dashboard')
    expect(result.status).toBe('active')
  })

  it('handles null and undefined', () => {
    expect(scrubObject(null)).toBe(null)
    expect(scrubObject(undefined)).toBe(undefined)
  })

  it('preserves numbers and booleans', () => {
    const obj = {
      count: 42,
      enabled: true,
    }
    const result = scrubObject(obj)

    expect(result.count).toBe(42)
    expect(result.enabled).toBe(true)
  })
})
