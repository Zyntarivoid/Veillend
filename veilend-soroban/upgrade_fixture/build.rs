fn main() {
    // Selects which contract metadata the fixture wasm reports:
    //   FIXTURE_VERSION=v1 -> contract_version 4 (downgrade target)
    //   (default)          -> contract_version 6, storage schema 4 (upgrade target)
    // This lets a single crate produce both fixture wasms:
    //   FIXTURE_VERSION=v1 cargo build --release --target wasm32-unknown-unknown
    //   cargo build --release --target wasm32-unknown-unknown
    if std::env::var("FIXTURE_VERSION").as_deref() == Ok("v1") {
        println!("cargo:rustc-cfg=fixture_v1");
    }
    println!("cargo:rerun-if-env-changed=FIXTURE_VERSION");
}
