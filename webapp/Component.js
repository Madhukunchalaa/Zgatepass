sap.ui.define([
	"sap/ui/core/UIComponent",
	"./model/models",
	"sap/ui/core/routing/History",
	"sap/ui/Device",
	"sap/ui/model/resource/ResourceModel",
	"sap/ui/model/json/JSONModel"
], function(UIComponent, models, History, Device, ResourceModel, JSONModel) {
	"use strict";

	return UIComponent.extend("zgpms.meilpower.com.Component", {
		metadata: {
			manifest: "json",
			interfaces: ["sap.ui.core.IAsyncContentCreation"]
		},

		init: function () {
			UIComponent.prototype.init.apply(this, arguments);

			// Initialize global user model
			var oUserModel = new JSONModel({
				IsGatepassUserOnly: false,
				IsHodUser: false,
				IsStoreUser: false
			});
			sap.ui.getCore().setModel(oUserModel, "user");
			this.setModel(oUserModel, "user");

			// Restore user session from localStorage
			var sSavedUser = localStorage.getItem("gpms_user");
			if (sSavedUser) {
				try {
					var oUserData = JSON.parse(sSavedUser);
					oUserModel.setData(oUserData);

					var sUserId = oUserData.id || oUserData.User || oUserData.name || "";
					console.log("[GPMS Component] Restored session for user ID:", sUserId, oUserData);
					
					// Asynchronously refresh user details from backend to update roles
					if (sUserId) {
						this._refreshUserDetails(sUserId);
					}
				} catch (e) {
					console.error("Error restoring user session:", e);
				}
			}

			this.setModel(models.createDeviceModel(), "device");

			// Initialize global IRGP collection for multi-persona state tracking (start empty)
			var oIRGPGlobalData = {
				documents: []
			};
			var oIRGPGlobalModel = new JSONModel(oIRGPGlobalData);
			this.setModel(oIRGPGlobalModel, "irgpGlobal");

			// Initialize mock scrap inventory in localStorage if not already present
			if (!localStorage.getItem("mockScrapInventory")) {
				var oScrapInv = {
					"Metal": { quantity: 280205.5, uom: "Kilogram" },
					"Spent Oil": { quantity: 9585, uom: "Litre" },
					"Plastic": { quantity: 66989, uom: "Kilogram" },
					"Rubber": { quantity: 3121, uom: "Kilogram" },
					"Glass": { quantity: 6, uom: "Kilogram" },
					"Others": { quantity: 0, uom: "Number" },
					"Wood": { quantity: 2258, uom: "Kilogram" },
					"Lube/Diesel filter": { quantity: 0, uom: "Kilogram" },
					"Other filter": { quantity: 2, uom: "Kilogram" },
					"Electrical Waste": { quantity: 3861, uom: "Kilogram" }
				};
				localStorage.setItem("mockScrapInventory", JSON.stringify(oScrapInv));
			}

			// Setup automatic global Plant filter interceptor for all OData GET calls
			this._setupGlobalPlantFilter();

			this.getRouter().initialize();
		},

		/**
		 * Intercepts all OData GET calls (read) on the default ODataModel.
		 * Automatically injects the logged-in user's Plant filter from user>/Plant
		 * into any entity set that requires plant filtering (unless already filtered or excluded).
		 */
		_setupGlobalPlantFilter: function () {
			var oODataModel = this.getModel();
			if (!oODataModel || oODataModel._bPlantFilterHooked) {
				return;
			}
			oODataModel._bPlantFilterHooked = true;

			// Entity sets that must NOT have an automatic Plant filter
			var aExcludedPaths = [
				"/ZUserdetSet",
				"/ZPlantSet",
				"/zdepartuserSet",
				"/ZsaleOrdersSet",
				"/ZsaleOrderItmSet",
				"/ZWBSElementSet",
				"/ScrapReqHdrSet",
				"/ScrapReqItmSet",
				"/ScrapPassHdrSet",
				"/ScrapPassItmSet"
			];

			var fnOriginalRead = oODataModel.read.bind(oODataModel);

			oODataModel.read = function (sPath, mParameters) {
				mParameters = mParameters || {};

				var sCleanPath = typeof sPath === "string" ? sPath.split("(")[0].trim() : "";
				var bIsExcluded = aExcludedPaths.some(function (ex) {
					return sCleanPath.toLowerCase() === ex.toLowerCase();
				});

				if (!bIsExcluded && sCleanPath) {
					var oUserModel = sap.ui.getCore().getModel("user");
					var sUserPlant = oUserModel ? (oUserModel.getProperty("/Plant") || oUserModel.getProperty("/plant")) : "";
					if (!sUserPlant) {
						try {
							var sSaved = localStorage.getItem("gpms_user");
							if (sSaved) {
								var oParsed = JSON.parse(sSaved);
								sUserPlant = oParsed.Plant || oParsed.plant || "";
							}
						} catch (e) {}
					}

					if (sUserPlant) {
						mParameters.filters = mParameters.filters || [];
						var bHasPlantFilter = mParameters.filters.some(function (f) {
							var p = (f.sPath || f._sPath || "").toLowerCase();
							return p === "plant" || p === "zwerks";
						});

						if (!bHasPlantFilter) {
							console.log("[Global Plant Filter] Auto-injected Plant = '" + sUserPlant + "' into " + sPath);
							mParameters.filters.push(new sap.ui.model.Filter("Plant", sap.ui.model.FilterOperator.EQ, sUserPlant));
						}
					}
				}

				return fnOriginalRead(sPath, mParameters);
			};
		},

		_refreshUserDetails: function (sUserId) {
			var oODataModel = this.getModel();
			if (!oODataModel) {
				return;
			}
			var oUserModel = this.getModel("user");
			console.log("[GPMS Component] Refreshing user details for user:", sUserId);
			oODataModel.read("/ZUserdetSet", {
				filters: [new sap.ui.model.Filter("User", sap.ui.model.FilterOperator.EQ, sUserId)],
				success: function (oData) {
					var oResult = (oData.results && oData.results[0]) || {};
					console.log("[GPMS Component] /ZUserdetSet raw results count:", (oData.results || []).length, oData.results);
					console.log("[GPMS Component] Raw user profile record:", oResult);

					if (oUserModel) {
						var sFullName = (oResult.UserFullName || oResult.UserName || oResult.NameText || oResult.Name || sUserId).trim();
						var sRole = (oResult.Role || "").trim().toUpperCase();
						var sDept = (oResult.Department || "").trim().toUpperCase();
						oUserModel.setProperty("/fullName", sFullName);
						oUserModel.setProperty("/UserFullName", oResult.UserFullName || sFullName);
						oUserModel.setProperty("/Username", sFullName);
						oUserModel.setProperty("/Plant", oResult.Plant || "");
						oUserModel.setProperty("/Cocode", oResult.Cocode || "");
						oUserModel.setProperty("/Department", oResult.Department || "");
						oUserModel.setProperty("/Role", sRole);
						try {
							localStorage.setItem("username_" + sUserId.toUpperCase(), sFullName);
						} catch (e) {}

						var bIsHod = sRole.indexOf("HOD") !== -1 ||
						             sDept.indexOf("HOD") !== -1 ||
						             sRole === "ZC_MM_GATEPASS_HOD_FRONT_VIEW" ||
						             sRole === "ZC_MM_GATEPASS_HOD_FRONTVIEW" ||
						             sRole === "Z_MM_GATEPASS_HOD_FRONT_VIEW" ||
						             sRole === "Z_MM_GATEPASS_HOD_FRONTVIEW";

						var bIsStoreUser = sRole.indexOf("STORE") !== -1 ||
						                   sDept.indexOf("STORE") !== -1 ||
						                   sRole === "ZC_MM_GATEPASS_STORE_FRONTVIEW" ||
						                   sRole === "ZC_MM_GATEPASS_STORE_FRONT_VIEW" ||
						                   sRole === "Z_MM_GATEPASS_STORE_FRONTVIEW" ||
						                   sRole === "Z_MM_GATEPASS_STORE_FRONT_VIEW";

						var bIsUserOnly = (!bIsHod && !bIsStoreUser) && (
						    sRole.indexOf("USER") !== -1 ||
						    sRole.indexOf("REQUESTER") !== -1 ||
						    sRole === "ZC_MM_GATEPASS_USER_FRONT_VIEW" ||
						    sRole === "ZC_MM_GATEPASS_USER_FRONTVIEW" ||
						    sRole === "Z_MM_GATEPASS_USER_FRONT_VIEW" ||
						    sRole === "Z_MM_GATEPASS_USER_FRONTVIEW"
						);

						console.log("%c[GPMS Component] User Details & Roles Evaluated:", "color: #0070f3; font-weight: bold; font-size: 13px;", {
							UserId: sUserId,
							Department: oResult.Department || "(empty)",
							Role: sRole || "(empty)",
							Plant: oResult.Plant || "(empty)",
							Cocode: oResult.Cocode || "(empty)",
							IsStoreUser: bIsStoreUser,
							IsHodUser: bIsHod,
							IsGatepassUserOnly: bIsUserOnly,
							AllData: oUserModel.getData()
						});

						oUserModel.setProperty("/IsGatepassUserOnly", bIsUserOnly);
						oUserModel.setProperty("/IsHodUser", bIsHod);
						oUserModel.setProperty("/IsStoreUser", bIsStoreUser);
						localStorage.setItem("gpms_user", JSON.stringify(oUserModel.getData()));
					}
				}.bind(this),
				error: function (oError) {
					console.error("[GPMS Component] Error refreshing user details:", oError);
				}
			});
		},

		myNavBack: function () {
			var oHistory = History.getInstance();
			var oPrevHash = oHistory.getPreviousHash();
			if (oPrevHash !== undefined) {
				window.history.go(-1);
			} else {
				this.getRouter().navTo("masterSettings", {}, undefined, true);
			}
		},

		getContentDensityClass: function () {
			if (!this._sContentDensityClass) {
				if (!Device.support.touch){
					this._sContentDensityClass = "sapUiSizeCompact";
				} else {
					this._sContentDensityClass = "sapUiSizeCozy";
				}
			}
			return this._sContentDensityClass;
		}
	});
});