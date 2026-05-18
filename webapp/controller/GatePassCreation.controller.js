sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator"
], function (BaseController, JSONModel, MessageBox, MessageToast, Filter, FilterOperator) {
	"use strict";
	return BaseController.extend("zgpms.meilpower.com.controller.GatePassCreation", {
		formatter: {
			formatHsnCodeDesc: function (sCode, sDesc) {
				if (sCode && sDesc) {
					return sCode + " - " + sDesc;
				}
				return sCode || sDesc || "";
			},
			formatMaterial: function (sCode, sName) {
				if (sCode && sName) {
					return sCode + " - " + sName;
				}
				return sCode || sName || "";
			}
		},

		onMaterialValueHelp: function (oEvent) {
			this._oInputSource = oEvent.getSource();
			this._oRowContext = this._oInputSource.getBindingContext("gp");
			var sPlant = this.getView().getModel("gp").getProperty("/Plant");

			if (!sPlant) {
				MessageToast.show("Please select plant first");
				return;
			}

			if (!this._pMaterialValueHelp) {
				this._pMaterialValueHelp = sap.ui.core.Fragment.load({
					id: this.getView().getId(),
					name: "zgpms.meilpower.com.view.fragments.MaterialValueHelp",
					controller: this
				}).then(function (oDialog) {
					this.getView().addDependent(oDialog);
					return oDialog;
				}.bind(this));
			}

			this._pMaterialValueHelp.then(function (oDialog) {
				oDialog.getBinding("items").filter([]);
				oDialog.open();
			});
		},

		onMaterialValueHelpSearch: function (oEvent) {
			var sValue = oEvent.getParameter("value");
			var oFilter = new Filter({
				filters: [
					new Filter("Material", FilterOperator.Contains, sValue),
					new Filter("MaterialName", FilterOperator.Contains, sValue),
					new Filter("HsnDesc", FilterOperator.Contains, sValue)
				],
				and: false
			});
			oEvent.getSource().getBinding("items").filter([oFilter]);
		},

		onMaterialValueHelpConfirm: function (oEvent) {
			var oSelectedItem = oEvent.getParameter("selectedItem");
			if (!oSelectedItem) {
				return;
			}

			var oSelectedMaterial = oSelectedItem.getBindingContext("materials").getObject();
			var oModel = this.getView().getModel("gp");
			var sPath = this._oRowContext.getPath();

			oModel.setProperty(sPath + "/material", oSelectedMaterial.Material);
			oModel.setProperty(sPath + "/materialName", oSelectedMaterial.MaterialName);
			oModel.setProperty(sPath + "/hsnCode", oSelectedMaterial.HsnCode);
			oModel.setProperty(sPath + "/hsnDesc", oSelectedMaterial.HsnDesc);
			oModel.setProperty(sPath + "/uom", oSelectedMaterial.UOM);
			oModel.setProperty(sPath + "/rate", oSelectedMaterial.UnitPrice);

			var fQty = parseFloat(oModel.getProperty(sPath + "/quantity")) || 0;
			var fRate = parseFloat(oSelectedMaterial.UnitPrice) || 0;
			var fAmount = fQty * fRate;
			oModel.setProperty(sPath + "/amount", fAmount.toLocaleString('en-IN', {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			}));
			this._recalcTotal();

			this._oInputSource.setValueState("None");
		},

		onMaterialValueHelpCancel: function () {},

		onHsnCodeInputSuggest: function (oEvent) {
			var oInput = oEvent.getSource();
			var sValue = (oEvent.getParameter("suggestValue") || "").toUpperCase();

			var aMaterials = (this.getView().getModel("materials") || { getProperty: function () { return []; } }).getProperty("/results") || [];

			var oSeen = {};
			var aFiltered = [];
			aMaterials.forEach(function (m) {
				if (!m.HsnCode || oSeen[m.HsnCode]) { return; }
				if (!sValue || m.HsnCode.toUpperCase().indexOf(sValue) !== -1 || (m.HsnDesc || "").toUpperCase().indexOf(sValue) !== -1) {
					oSeen[m.HsnCode] = true;
					aFiltered.push(m);
				}
			});

			oInput.destroySuggestionItems();
			aFiltered.forEach(function (m) {
				oInput.addSuggestionItem(new sap.ui.core.Item({
					key: m.HsnCode,
					text: m.HsnCode + " - " + (m.HsnDesc || "")
				}));
			});
		},

		onHsnCodeInputSuggestionItemSelected: function (oEvent) {
			var oItem = oEvent.getParameter("selectedItem");
			if (!oItem) { return; }

			var oInput = oEvent.getSource();
			var sPath = oInput.getBindingContext("gp").getPath();
			var oModel = this.getView().getModel("gp");
			var sCode = oItem.getKey();
			var sText = oItem.getText();
			var sDesc = sText.indexOf(" - ") !== -1 ? sText.split(" - ").slice(1).join(" - ") : "";

			oModel.setProperty(sPath + "/hsnCode", sCode);
			oModel.setProperty(sPath + "/hsnDesc", sDesc);
			oInput.setValue(sCode);
		},

		onDescriptionEdit: function (oEvent) {
			var oSource = oEvent.getSource();
			var oContext = oSource.getBindingContext("gp");
			var oModel = this.getView().getModel("gp");
			var sPath = oContext.getPath();

			var sInitialVal = oModel.getProperty(sPath + "/materialName") || "";

			var oConfirmButton = new sap.m.Button({
				text: "Confirm",
				type: "Emphasized",
				enabled: sInitialVal.length <= 250,
				press: function () {
					oModel.setProperty(sPath + "/materialName", oTextArea.getValue().trim());
					oDialog.close();
				}
			});

			var oTextArea = new sap.m.TextArea({
				value: sInitialVal,
				rows: 6,
				maxLength: 250,
				showExceededText: true,
				width: "100%",
				placeholder: "Enter full material description (up to 250 characters)...",
				liveChange: function (oEvent) {
					var sVal = oEvent.getParameter("value") || "";
					var iLen = sVal.length;
					if (iLen > 250) {
						oConfirmButton.setEnabled(false);
					} else {
						oConfirmButton.setEnabled(true);
					}
				}
			});

			var oDialog = new sap.m.Dialog({
				title: "Material Description",
				contentWidth: "460px",
				content: [
					new sap.m.VBox({
						class: "sapUiSmallMarginBeginEnd sapUiSmallMarginTopBottom",
						items: [oTextArea]
					})
				],
				beginButton: oConfirmButton,
				endButton: new sap.m.Button({
					text: "Cancel",
					press: function () { oDialog.close(); }
				}),
				afterClose: function () { oDialog.destroy(); }
			});

			this.getView().addDependent(oDialog);
			oDialog.open();
		},

		onInit: function () {
			this._resetModel();

			var oODataModel = this.getOwnerComponent().getModel();
			if (oODataModel) {
				oODataModel.metadataLoaded().then(function () {
					this._loadPlants();
				}.bind(this)).catch(function () {
					MessageToast.show("Metadata unavailable — you can type Plant code manually.");
				});
			} else {
				this._loadPlants();
			}

			this.getRouter().getRoute("GatePassCreation").attachPatternMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			var oArgs = oEvent.getParameter("arguments");
			var sType = oArgs ? oArgs.type : null;

			this._resetModel();

			var oModel = this.getView().getModel("gp");
			if (oModel) {
				if (sType) {
					oModel.setProperty("/GatePassType", sType);
					oModel.setProperty("/isTypeEditable", false);
				} else {
					oModel.setProperty("/GatePassType", "");
					oModel.setProperty("/isTypeEditable", true);
				}

				// Pre-fill Plant, Company Code and Department from logged-in user profile
				var oUserModel = sap.ui.getCore().getModel("user");
				if (oUserModel) {
					var sPlant = oUserModel.getProperty("/Plant");
					var sCocode = oUserModel.getProperty("/Cocode");
					var sDept = oUserModel.getProperty("/Department");

					if (sCocode) { oModel.setProperty("/Cocode", sCocode); }
					if (sDept) {
						// Match case-insensitively against the Select's item keys
						var oDeptSelect = this.byId("department");
						var sMatchedDept = sDept;
						if (oDeptSelect) {
							var oMatch = oDeptSelect.getItems().find(function (oItem) {
								return oItem.getKey().toUpperCase() === sDept.toUpperCase();
							});
							if (oMatch) { sMatchedDept = oMatch.getKey(); }
						}
						oModel.setProperty("/Department", sMatchedDept);
					}
					if (sPlant) {
						oModel.setProperty("/Plant", sPlant);
						this._loadVendors(sPlant);
						this._loadMaterials(sPlant);
					}
				}
			}
		},

		_loadPlants: function () {
			var oPlantModel = new JSONModel({ results: [] });
			this.getView().setModel(oPlantModel, "plants");

			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read("/ZPlantSet", {
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var aResults = oData.results || [];
					if (aResults.length === 0) { return; }
					var aNormalized = aResults.map(function (p) {
						return {
							Plant: p.Plant || p.Matnr || "",
							PlantName: p.PlantName || p.Pname || p.Name1 || p.Plantname || p.Plant || "",
							CoCode: p.CoCode || p.CompanyCode || "",
							UOM: p.Meins || p.Uom || p.BaseUOM || ""
						};
					});
					oPlantModel.setProperty("/results", aNormalized);
				},
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					var sStatus = oError.statusCode || oError.status || "";
					var sDetail = "";
					try {
						var oResp = JSON.parse(oError.responseText);
						sDetail = oResp.error && (oResp.error.message.value || oResp.error.message) || "";
					} catch (e) {
						sDetail = oError.responseText || oError.message || "";
					}
					var sHint = sStatus ? (" (HTTP " + sStatus + ")") : "";
					MessageToast.show("Plant list unavailable" + sHint + " — type Plant code manually.", { duration: 4000 });
				}
			});
		},

		_resetModel: function () {
			var oViewModel = new JSONModel({
				GatePassReqNo: "",
				GatePassType: "",
				isTypeEditable: true,
				Cocode: "",
				Plant: "",
				FiscalYear: String(new Date().getFullYear()),
				gpDate: new Date(),
				returnableDate: new Date(),
				vendor: "",
				vendorName: "",
				vendorAddress: "",
				vendorGST: "",
				fileName: "",
				Department: "",
				VehicleNo: "",
				ModeOfDispatch: "",
				items: [
					this._newItem(1)
				],
				Remarks: "",
				finalTotal: "0.00"
			});
			this.getView().setModel(oViewModel, "gp");
		},

		_newItem: function (iSno) {
			return {
				sno: String(iSno).padStart(2, '0'),
				material: "",
				materialName: "",
				hsnCode: "",
				hsnDesc: "",
				quantity: 1,
				uom: "",
				rate: 0,
				amount: "0.00"
			};
		},

		_loadMaterials: function (sPlant) {
			var oMaterialsModel = this.getView().getModel("materials");
			if (!oMaterialsModel) {
				oMaterialsModel = new JSONModel({ results: [] });
				this.getView().setModel(oMaterialsModel, "materials");
			}

			if (!sPlant) {
				oMaterialsModel.setProperty("/results", []);
				return;
			}

			oMaterialsModel.setProperty("/results", []);

			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }

			var aFilters = [new Filter("Plant", FilterOperator.EQ, sPlant)];

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read("/ZMaterialSet", {
				filters: aFilters,
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var aResults = oData.results || [];
					var aNormalized = aResults.map(function (m) {
						return {
							Material: m.Material || m.Matnr || "",
							MaterialName: m.Maktx || m.MaterialDesc || m.Description || m.MatDesc || m.Materialtxt || m.Material || "",
							HsnDesc: m.HSNDesc || "",
							HsnCode: m.HSNCode || "",
							UOM: m.Meins || m.Uom || m.BaseUOM || m.UOM || "",
							UnitPrice: parseFloat(m.UnitPrice) || 0
						};
					});
					oMaterialsModel.setProperty("/results", aNormalized);
				},
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					var sMsg = "Failed to load materials for plant " + sPlant;
					try {
						var oResp = JSON.parse(oError.responseText);
						sMsg += "\nDetails: " + (oResp.error.message.value || oResp.error.message || "Unknown error");
					} catch (e) {
						if (oError.message) { sMsg += "\nMessage: " + oError.message; }
					}
					MessageBox.error(sMsg);
				}
			});
		},

		onPlantChange: function (oEvent) {
			var oSelectedItem = oEvent.getParameter("selectedItem");
			if (!oSelectedItem) { return; }

			var sKey = oSelectedItem.getKey();
			this._applyPlant(sKey);
		},

		onComboBoxPlantChange: function (oEvent) {
			// Only handle manual typed input — skip if user selected from the dropdown list
			if (oEvent.getSource().getSelectedItem()) { return; }
			var sValue = (oEvent.getParameter("value") || "").trim().toUpperCase();
			if (!sValue) { return; }
			this._applyPlant(sValue);
		},

		_applyPlant: function (sKey) {
			var oGpModel = this.getView().getModel("gp");
			oGpModel.setProperty("/Plant", sKey);

			var oPlantModel = this.getView().getModel("plants");
			var aPlants = (oPlantModel && oPlantModel.getProperty("/results")) || [];
			var oPlant = aPlants.find(function (p) { return p.Plant === sKey; });
			if (oPlant && oPlant.CoCode) {
				oGpModel.setProperty("/Cocode", oPlant.CoCode);
			}

			var aItems = oGpModel.getProperty("/items");
			aItems.forEach(function (item) {
				item.material = "";
				item.materialName = "";
				item.hsnCode = "";
				item.hsnDesc = "";
				item.uom = "";
				item.rate = 0;
				item.amount = "0.00";
			});
			oGpModel.setProperty("/items", aItems);
			this._recalcTotal();

			this._loadVendors(sKey);
			this._loadMaterials(sKey);

			MessageToast.show("Materials refreshed for selected plant");
		},

		_loadVendors: function (sPlant) {
			var oVendorModel = new JSONModel({ results: [] });
			this.getView().setModel(oVendorModel, "vendors");

			if (!sPlant) { return; }

			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }

			var aFilters = [new Filter("Plant", FilterOperator.EQ, sPlant)];

			oODataModel.read("/ZVendorSet", {
				filters: aFilters,
				success: function (oData) {
					var aResults = oData.results || [];
					if (aResults.length === 0) { return; }
					var aNormalized = aResults.map(function (v) {
						return {
							Vendor: v.Vendor || v.Lifnr || "",
							VendorName: v.Name || v.VendorName || v.Name1 || "Unknown Vendor",
							Street: v.Address || v.Street || "",
							City: v.City || "",
							PostalCode: v.ZipCode || v.PostalCode || "",
							Country: v.Country || "",
							VendorGST: v.VendorGST || v.TaxNumber1 || ""
						};
					});
					oVendorModel.setProperty("/results", aNormalized);
				},
				error: function (oError) {
					MessageBox.error("Failed to load vendors. Please try again.");
				}
			});
		},

		onVendorSelect: function (oEvent) {
			var oItem = oEvent.getParameter("selectedItem");
			if (!oItem) { return; }

			var sKey = oItem.getKey();
			var aVendors = this.getView().getModel("vendors").getProperty("/results");
			var oVendor = aVendors.find(function (v) { return v.Vendor === sKey; });
			if (!oVendor) { return; }

			var sAddress = [oVendor.Street, oVendor.City, oVendor.PostalCode, oVendor.Country].filter(Boolean).join(", ");

			var oGp = this.getView().getModel("gp");
			oGp.setProperty("/vendorAddress", sAddress);
			oGp.setProperty("/vendorGST", oVendor.VendorGST);
		},

		onFileChange: function (oEvent) {
			var sFileName = oEvent.getParameter("newValue");
			this.getView().getModel("gp").setProperty("/fileName", sFileName || "");
			if (!sFileName) {
				oEvent.getSource().clear();
			}
		},

		onAddItem: function () {
			var oGp = this.getView().getModel("gp");
			var aItems = oGp.getProperty("/items");
			aItems.push(this._newItem(aItems.length + 1));
			oGp.setProperty("/items", aItems);
		},

		onRemoveItem: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("gp").getObject();
			var oGp = this.getView().getModel("gp");
			var aItems = oGp.getProperty("/items");
			var iIndex = aItems.indexOf(oItem);
			if (iIndex > -1) {
				aItems.splice(iIndex, 1);
				aItems.forEach(function (it, i) {
					it.sno = String(i + 1).padStart(2, '0');
				});
				oGp.setProperty("/items", aItems);
				this._recalcTotal();
			}
		},

		onQtyRateChange: function (oEvent) {
			var oSource = oEvent.getSource();
			var oContext = oSource.getBindingContext("gp");
			var oModel = this.getView().getModel("gp");

			var oBinding = oSource.getBinding("value");
			if (oBinding) {
				var fValue = parseFloat(oSource.getValue()) || 0;
				if (fValue < 0) {
					fValue = 0;
					oSource.setValue("0");
				}
				oModel.setProperty(oContext.getPath() + "/" + oBinding.getPath(), fValue);
			}

			var oItem = oContext.getObject();
			var fQty = parseFloat(oItem.quantity) || 0;
			var fRate = parseFloat(oItem.rate) || 0;
			var fAmount = fQty * fRate;

			oModel.setProperty(oContext.getPath() + "/amount", fAmount.toLocaleString('en-IN', {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			}));

			this._recalcTotal();
		},

		_recalcTotal: function () {
			var oGp = this.getView().getModel("gp");
			var aItems = oGp.getProperty("/items");
			var fTotal = 0;

			aItems.forEach(function (it) {
				var fAmt = parseFloat(String(it.amount).replace(/,/g, '')) || 0;
				fTotal += fAmt;
			});

			oGp.setProperty("/finalTotal", fTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
		},

		onSubmit: function () {
			try {
				var oGp = this.getView().getModel("gp").getData();

				if (!oGp.Plant) {
					MessageBox.error("Please select Plant first.");
					return;
				}

				if (!oGp.vendor) {
					MessageBox.error("Please select a Vendor.");
					return;
				}

				if (!oGp.Department) {
					MessageBox.error("Please select a Department.");
					return;
				}

				if (oGp.Remarks && oGp.Remarks.length > 250) {
					MessageBox.error("Remarks cannot exceed 250 characters.");
					return;
				}

				if (oGp.GatePassType === "RGP" && !oGp.returnableDate) {
					MessageBox.error("Please select Returnable Date for RGP.");
					return;
				}

				var oVendorModel = this.getView().getModel("vendors");
				var aVendorList = (oVendorModel && oVendorModel.getProperty("/results")) || [];
				var oSelectedVendor = aVendorList.find(function (v) {
					return v.Vendor === oGp.vendor;
				}) || {};

				var fnFormatDate = function (oDate) {
					if (!oDate) return "";
					if (typeof oDate === "string" && oDate.length === 8 && !isNaN(oDate)) {
						return oDate;
					}
					var d = (oDate instanceof Date) ? oDate : new Date(oDate);
					if (isNaN(d.getTime())) return "";
					var y = d.getFullYear();
					var m = String(d.getMonth() + 1).padStart(2, '0');
					var day = String(d.getDate()).padStart(2, '0');
					return y + m + day;
				};

				var oPayload = {
					GatePassType: oGp.GatePassType,
					Cocode: oGp.Cocode,
					Plant: oGp.Plant,
					FiscalYear: oGp.FiscalYear,
					GpDate: fnFormatDate(oGp.gpDate),
					Vendor: oGp.vendor,
					VendorName: oSelectedVendor.VendorName || "",
					VendorGST: oGp.vendorGST || "",
					ZipCode: oSelectedVendor.PostalCode || "",
					City: oSelectedVendor.City || "",
					ApprovalReq: "X",
					Department: oGp.Department,
					VehicleNo: oGp.VehicleNo || "",
					ModeOfDispatch: oGp.ModeOfDispatch || "",
					Remarks: oGp.Remarks || "",
					ReturnableDate: fnFormatDate(oGp.returnableDate),

					GateReqItemNav: (oGp.items || []).map(function (it, index) {
						var fQty = parseFloat(String(it.quantity).replace(/,/g, '')) || 0;
						var fRate = parseFloat(String(it.rate).replace(/,/g, '')) || 0;
						var fValue = fQty * fRate;

						return {
							GatePassType: oGp.GatePassType || "",
							ItemNo: String((index + 1) * 10).padStart(5, '0'),
							Material: it.material || "",
							MaterialDesc: it.materialName || "",
							HSNCode: it.hsnCode || "",
							HSNDesc: it.hsnDesc || "",
							UOM: it.uom || "EA",
							ItemNetPrice: fRate.toFixed(2),
							RequestedQuantity: fQty.toFixed(3),
							Totalvalue: fValue.toFixed(2),
							Remarks: it.remarks || ""
						};
					})
				};

				var oODataModel = this.getOwnerComponent().getModel();
				if (!oODataModel) {
					MessageBox.error("Backend OData service not connected.");
					return;
				}

				sap.ui.core.BusyIndicator.show(0);

				oODataModel.create("/GatePassReqHdrSet", oPayload, {
					success: function (oData) {
						sap.ui.core.BusyIndicator.hide();

						var sReqNo = oData.GatePassReqNo || "";
						var sMsg = oData.Message || "Gate Pass Request created successfully!";
						var sDisplayMsg = sMsg;
						if (sReqNo && sMsg.indexOf(sReqNo) === -1) {
							sDisplayMsg += "\nRequest Number: " + sReqNo;
						}

						MessageBox.success(sDisplayMsg, {
							actions: [MessageBox.Action.OK, "Copy Number"],
							emphasizedAction: MessageBox.Action.OK,
							onClose: function (sAction) {
								if (sAction === "Copy Number") {
									navigator.clipboard.writeText(sReqNo).then(function () {
										MessageToast.show("Request Number " + sReqNo + " copied!");
									}).catch(function () {
										var textArea = document.createElement("textarea");
										textArea.value = sReqNo;
										document.body.appendChild(textArea);
										textArea.select();
										document.execCommand('copy');
										document.body.removeChild(textArea);
										MessageToast.show("Request Number copied!");
									});
								}
								this._resetModel();
							}.bind(this)
						});
					}.bind(this),

					error: function (oError) {
						sap.ui.core.BusyIndicator.hide();
						var sErrorMsg = "Failed to create Gate Pass.";
						try {
							var oResp = JSON.parse(oError.responseText);
							sErrorMsg = oResp.error.message.value;
						} catch (e) {}
						MessageBox.error(sErrorMsg);
					}
				});

			} catch (err) {
				sap.ui.core.BusyIndicator.hide();
				MessageBox.error("Client Error: " + err.message);
			}
		},

		onClear: function () {
			this._resetModel();
		}
	});
});
