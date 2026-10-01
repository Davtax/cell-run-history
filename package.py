"""Build cell-run-history-<version>.vsix without Node tooling (a .vsix is a zip with a manifest)."""

import json
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

HERE = Path(__file__).parent
FILES = ["package.json", "extension.js", "history.js", "README.md", "LICENSE"]

pkg = json.loads((HERE / "package.json").read_text())
target = HERE / f"{pkg['name']}-{pkg['version']}.vsix"

manifest = f"""<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"
                 xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="{pkg["name"]}" Version="{pkg["version"]}" Publisher="{pkg["publisher"]}" />
    <DisplayName>{escape(pkg["displayName"])}</DisplayName>
    <Description xml:space="preserve">{escape(pkg["description"])}</Description>
    <Categories>{",".join(pkg["categories"])}</Categories>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="{pkg["engines"]["vscode"]}" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="{",".join(pkg["extensionKind"])}" />
    </Properties>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code" />
  </Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true" />
  </Assets>
</PackageManifest>
"""

content_types = """<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension=".json" ContentType="application/json" />
  <Default Extension=".js" ContentType="application/javascript" />
  <Default Extension=".md" ContentType="text/markdown" />
  <Default Extension=".vsixmanifest" ContentType="text/xml" />
</Types>
"""

with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as vsix:
    vsix.writestr("[Content_Types].xml", content_types)
    vsix.writestr("extension.vsixmanifest", manifest)
    for name in FILES:
        vsix.write(HERE / name, f"extension/{name}")

print(target)
