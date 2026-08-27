# Production WordPress SSH Access

This document records how authorized maintainers connect to the ProSkaters Place production WordPress server. Never place the private key in this repository or paste it into tickets, chat messages, logs, or screenshots.

## Server details

- Instance: `ProSkatersPlace-PROD-02`
- AWS Lightsail region: Virginia (`us-east-1`)
- Static public IPv4: `54.205.226.65`
- Public IPv6: `2600:1f18:1d9:8700:561e:5335:6a48:e28d`
- SSH username: `bitnami`
- Local private-key path: `C:\Users\paulg\.ssh\proskatersplace-bitnami.pem`
- Active WordPress root: `/opt/bitnami/wordpress`
- Must-use plugins: `/opt/bitnami/wordpress/wp-content/mu-plugins`

The private key is intentionally not stored in the repository. The repository `.gitignore` excludes `*.pem` files.

## Connect from Windows PowerShell

Use the static IPv4 address:

```powershell
ssh -i "$env:USERPROFILE\.ssh\proskatersplace-bitnami.pem" -o IdentitiesOnly=yes bitnami@54.205.226.65
```

If the local network supports IPv6, the public IPv6 address can be used instead:

```powershell
ssh -6 -i "$env:USERPROFILE\.ssh\proskatersplace-bitnami.pem" -o IdentitiesOnly=yes bitnami@2600:1f18:1d9:8700:561e:5335:6a48:e28d
```

On the first connection, SSH will ask you to confirm the server host key. Verify the fingerprint through the trusted AWS Lightsail console before accepting it.

## Protect the private key on Windows

If Windows OpenSSH reports that the private key permissions are too open, restrict the file to the current Windows account:

```powershell
icacls "$env:USERPROFILE\.ssh\proskatersplace-bitnami.pem" /inheritance:r
icacls "$env:USERPROFILE\.ssh\proskatersplace-bitnami.pem" /grant:r "$($env:USERNAME):(R)"
```

## Browser-based fallback

If port 22 times out, open AWS Lightsail, select `ProSkatersPlace-PROD-02`, open the **Connect** tab, and choose **Connect using SSH**. Do not expose SSH to `0.0.0.0/0` as a workaround. If direct SSH is required, restrict any temporary port 22 firewall rule to the maintainer's current public IP address with a `/32` mask, then remove it when finished.

## Production verification commands

Confirm the host and WordPress installation before making changes:

```bash
whoami
hostname
sudo wp --path=/opt/bitnami/wordpress core is-installed
sudo wp --path=/opt/bitnami/wordpress plugin get wp-graphql --field=status
```

Verify the GraphQL error sanitizer after deployment:

```bash
php -l /opt/bitnami/wordpress/wp-content/mu-plugins/psp-graphql-error-sanitizer.php
sha256sum /opt/bitnami/wordpress/wp-content/mu-plugins/psp-graphql-error-sanitizer.php
sudo wp --path=/opt/bitnami/wordpress plugin list --status=must-use
```

Must-use plugins load automatically and do not require activation in WordPress Admin.
