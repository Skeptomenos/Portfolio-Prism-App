# Application Shell Strategy

> **Purpose:** Strategic decision for desktop application framework selection and long-term architecture
> **Scope:** High-level shell strategy, not implementation specifications
> **Also read:** `anamnesis/strategy/language-stack.md` for language strategy
> **Also read:** `anamnesis/strategy/technical-components.md` for component analysis

---

## Executive Summary

**Decision: Tauri v2** is selected as the application shell for Portfolio Prism. Despite longer compilation times compared to alternatives, Tauri provides the optimal balance of **security, reliability, and proven update mechanisms** critical for a financial desktop application. The built-in updater, mature ecosystem, and cross-platform native performance outweigh the development speed advantages of alternatives like Wails.

---

## Our Choice: Tauri v2

### Why Tauri Wins for Portfolio Prism

**1. Security & Reliability (Critical for Financial Apps)**
- **Built-in Auto-Updater**: Production-ready update mechanism with signature verification
- **Memory Safety**: Rust's ownership model prevents memory corruption vulnerabilities
- **Proven Security**: Battle-tested in production applications
- **Sandboxed Architecture**: Clear security boundaries between shell and Python sidecar

**2. Update Mechanism Superiority**
- **Zero-Effort Setup**: `@tauri-apps/plugin-updater` works out of the box
- **Security Verification**: Built-in digital signature verification
- **Cross-Platform Consistency**: Same update experience on Windows, macOS, Linux
- **Professional Distribution**: GitHub Releases integration with delta updates

**3. Ecosystem Maturity**
- **Large Community**: Extensive documentation, tutorials, and Stack Overflow answers
- **Battle-Tested**: Proven in production desktop applications
- **Rich Plugin Ecosystem**: Mature plugins for common desktop needs
- **Active Development**: Regular updates and security patches

**4. Bundle Size & Performance**
- **Lightweight**: ~50MB shell (vs 300MB+ Electron)
- **Native Performance**: Uses system WebView, no bundled Chromium
- **Fast Startup**: Native compilation, no VM warmup
- **Low Resource Usage**: Minimal memory footprint

**5. Multi-Language Architecture Support**
- **Excellent Sidecar Support**: Designed for external binary management
- **Flexible IPC**: JSON stdout/stderr communication proven in our project
- **Process Management**: Built-in process lifecycle and monitoring
- **Environment Injection**: Clean configuration management

---

## Alternative Analysis: Why We Chose Tauri Over Wails

### Wails Benefits (Why It Was Tempting)

**Development Speed Advantages:**
- **Fast Compilation**: 1-5 second Go compiles vs 4-minute Rust compiles
- **Simpler Language**: Go is easier to learn than Rust
- **Rapid Iteration**: Faster feedback loop for development

**Technical Strengths:**
- **Excellent Concurrency**: Goroutines for parallel operations
- **Small Binaries**: 15-20MB vs 50MB Tauri
- **Cross-Platform**: True single codebase compilation
- **Mobile Support**: Potential Flutter integration for future

### Critical Wails Limitations (Deal Breakers)

**1. No Built-in Auto-Update System**
- **Manual Implementation Required**: 6-8 weeks of custom development
- **Security Complexity**: Manual signature verification and key management
- **Platform-Specific Code**: Different update logic for Windows/macOS/Linux
- **Maintenance Burden**: Ongoing security patching and compatibility

**2. Update System Complexity**
```
Wails Update Requirements:
- Custom version checking service
- Download manager with progress tracking
- Platform-specific installation logic
- Security verification implementation
- Rollback mechanisms
- Update server setup and maintenance

Tauri Provides:
- Built-in updater plugin
- Automatic signature verification
- Cross-platform consistency
- GitHub Releases integration
- Delta update support
```

**3. Financial Application Risks**
- **Security Compliance**: Manual update implementation increases security risk
- **User Trust**: Financial apps need proven, reliable update mechanisms
- **Regulatory Concerns**: Audit trails and update verification critical
- **Liability**: Update failures could affect user financial data

**4. Development Time Trade-off**
```
Time Investment Analysis:
- Wails: 6-8 weeks update system + 5-second compiles
- Tauri: 0 weeks update system + 4-minute compiles

Break-even Point: 8-12 weeks
After which, Tauri's faster overall development velocity
```

---

## Tauri Strategic Benefits for Our Vision

### **Rapid Feedback Loop Support**

**1. Professional Update Experience**
- **Reliable Updates**: Users get updates consistently and securely
- **Fast Distribution**: Small bundles download quickly even on slow connections
- **Automatic Checking**: Background update detection without user intervention
- **Rollback Support**: Built-in ability to revert problematic updates

**2. Development Workflow Optimization**
- **Hot Reload**: Frontend changes update instantly
- **Incremental Builds**: Rust compiler optimizes for changed files only
- **Debugging Integration**: Excellent tooling across Rust/TypeScript/Python
- **Testing Support**: Built-in testing frameworks and CI/CD integration

**3. Production Readiness**
- **Code Signing**: Built-in support for Apple Developer certificates
- **Notarization**: macOS notarization workflow support
- **Security Sandboxing**: Proven security model for financial apps
- **Compliance Ready**: Meets enterprise security requirements

### **Multi-Platform Strategy**

**Current Phase: macOS Primary**
- **Native Performance**: Optimized for macOS ecosystem
- **Apple Integration**: Keychain access, notifications, system integration
- **Code Signing**: Apple Developer ID integration
- **Notarization**: Automated macOS notarization support

**Future Expansion: Windows/Linux**
- **Cross-Platform Codebase**: Single Rust codebase compiles everywhere
- **Consistent Experience**: Same UI and functionality across platforms
- **Unified Updates**: Single update mechanism works across platforms
- **Market Expansion**: Easy entry into Windows and Linux markets

---

## Tauri Limitations & Mitigation Strategies

### **Current Limitations**

**1. Compilation Time**
- **Problem**: 4-minute initial compiles, 5-15 second incremental builds
- **Impact**: Slower development iteration compared to Wails
- **Mitigation**: Hot reload for frontend, incremental Rust compilation

**2. Learning Curve**
- **Problem**: Rust ownership model and borrow checker complexity
- **Impact**: Slower initial development velocity
- **Mitigation**: Investment in Rust expertise pays long-term dividends

**3. Three-Language Complexity**
- **Problem**: Context switching between Rust/TypeScript/Python
- **Impact**: Increased cognitive load during development
- **Mitigation**: Clear component boundaries and documentation

### **Mitigation Strategies**

**1. Development Workflow Optimization**
```bash
# Development mode with hot reload
npm run tauri dev

# Focus on frontend changes (instant reload)
# Backend changes require recompilation (acceptable trade-off)
```

**2. Build Process Improvement**
```yaml
# Optimized build configuration
[build]
beforeBuildCommand = "cargo check --all"  # Fast pre-build check
beforeDevCommand = "cargo watch"          # Watch for changes
```

**3. Component Architecture**
- **Clear Boundaries**: Well-defined interfaces between languages
- **Independent Development**: Each component can be developed separately
- **Documentation**: Comprehensive API documentation for cross-language work

---

## Strategic Roadmap

### **Phase 1: Stabilization (Months 1-2)**
**Goals:**
- Optimize current Tauri development workflow
- Implement hot reload improvements
- Establish efficient build pipeline
- Document component boundaries

**Actions:**
- Configure incremental compilation
- Set up development environment for rapid iteration
- Create debugging workflows across language boundaries
- Implement performance monitoring

### **Phase 2: Enhancement (Months 3-6)**
**Goals:**
- Enhance update mechanism with custom features
- Improve cross-platform compatibility
- Optimize bundle size and performance
- Add advanced security features

**Actions:**
- Custom update UI/UX improvements
- Implement delta updates for faster downloads
- Add crash reporting integration
- Optimize Python sidecar communication

### **Phase 3: Expansion (Months 6-12)**
**Goals:**
- Expand to Windows and Linux platforms
- Implement advanced security features
- Add plugin system for extensibility
- Optimize for enterprise deployment

**Actions:**
- Cross-platform testing and optimization
- Windows code signing and notarization
- Linux packaging and distribution
- Enterprise security features (FIPS compliance, etc.)

---

## Success Metrics

### **Development Velocity**
- **Frontend Iteration**: <2 seconds from change to visible result
- **Backend Compilation**: <30 seconds incremental builds
- **Full Build Time**: <5 minutes for complete application
- **Debugging Efficiency**: <5 minutes to identify and fix cross-language issues

### **Update Performance**
- **Update Detection**: <5 seconds to check for updates
- **Download Speed**: <2 minutes for typical update on broadband
- **Installation Time**: <30 seconds from download to launch
- **Update Success Rate**: >99% successful updates

### **User Experience**
- **App Startup**: <5 seconds from launch to usable
- **Bundle Size**: <100MB total application size
- **Memory Usage**: <200MB for typical usage
- **Cross-Platform Consistency**: Identical features across platforms

---

## Risk Assessment

### **Low Risk Factors**
- **Mature Technology**: Tauri is battle-tested and widely adopted
- **Proven Update System**: Built-in updater has extensive production use
- **Large Community**: Extensive documentation and community support
- **Financial App Suitability**: Security-first design aligns with requirements

### **Medium Risk Factors**
- **Learning Curve**: Rust expertise required for optimal development
- **Build Complexity**: Three-language coordination increases complexity
- **Platform Dependencies**: Native platform features require platform-specific testing

### **Mitigation Strategies**
- **Investment in Rust Skills**: Training and documentation for team
- **Component Isolation**: Clear boundaries reduce complexity
- **Automated Testing**: Comprehensive CI/CD across platforms
- **Community Engagement**: Active participation in Tauri ecosystem

---

## Conclusion

**Tauri v2 is the optimal strategic choice** for Portfolio Prism's application shell, providing the best balance of security, reliability, and professional update capabilities required for a financial desktop application. While Wails offers faster compilation times, the **6-8 weeks required to implement a production-ready update system** makes it a high-risk choice that would delay our rapid feedback loop vision.

The **proven nature of Tauri's update mechanism**, combined with its security-first design and mature ecosystem, provides the foundation needed for a reliable financial application that can evolve quickly based on user feedback.

**Our investment in Rust expertise and build optimization** will pay dividends in faster development cycles while maintaining the professional-grade update and security capabilities that Wails would require months to replicate.