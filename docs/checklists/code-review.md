# Code review checklist

Check:

- [ ] Does this solve the ticket?
- [ ] Are there unrelated changes?
- [ ] Is authentication required where needed?
- [ ] Is authorization checked before mutations?
- [ ] Is server-side validation present?
- [ ] Are errors handled safely?
- [ ] Are private values/secrets absent?
- [ ] Are tests meaningful?
- [ ] Are service responsibilities, contracts, and ownership boundaries clear?
- [ ] Does no caller bypass a service to access its internal dependency?
- [ ] Do changed Docker/Compose files have configuration, image-build, and
      proportionate health/connection coverage?
- [ ] Is the solution maintainable?
